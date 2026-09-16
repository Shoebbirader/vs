from datetime import datetime, timedelta, timezone
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_db_session
from ..tenant import TenantUser, get_current_user

router = APIRouter(prefix="/api/v2", tags=["automation"])


async def _notify_roles(
    session: AsyncSession,
    user: TenantUser,
    roles: tuple[str, ...],
    title: str,
    message: str,
    notification_type: str,
    source_type: str,
    reference_id: object,
) -> int:
    recipients = await session.execute(
        text(
            'select "id", "role" from "users" where "orgId" = :org_id and "role" in '
            "('SUPERADMIN', 'FLEET_MANAGER', 'INVENTORY_MANAGER')"
        ),
        {"org_id": user.org_id},
    )
    count = 0
    for recipient in recipients.mappings():
        if recipient["role"] not in roles:
            continue
        dedupe_key = f"{notification_type}:{reference_id}:{recipient['id']}"
        existing = await session.execute(
            text(
                'select "id" from "notifications" where "orgId" = :org_id '
                'and "recipientId" = :recipient_id and "dedupeKey" = :dedupe_key '
                'and "resolvedAt" is null'
            ),
            {
                "org_id": user.org_id,
                "recipient_id": recipient["id"],
                "dedupe_key": dedupe_key,
            },
        )
        if existing.first() is not None:
            continue
        await session.execute(
            text(
                'insert into "notifications" ("id", "orgId", "recipientId", "title", "message", '
                '"type", "severity", "sourceType", "dedupeKey", "referenceId", "isRead") '
                'values (:id, :org_id, :recipient_id, :title, :message, :type, :severity, '
                ':source_type, :dedupe_key, :reference_id, false)'
            ),
            {
                "id": str(uuid4()),
                "org_id": user.org_id,
                "recipient_id": recipient["id"],
                "title": title,
                "message": message,
                "type": notification_type,
                "severity": "CRITICAL" if notification_type == "DOCUMENT_EXPIRY" else "HIGH",
                "source_type": source_type,
                "dedupe_key": dedupe_key,
                "reference_id": reference_id,
            },
        )
        count += 1
    return count


@router.post("/automation/evaluate", response_model=dict[str, int])
async def evaluate_automation(
    current_user: TenantUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> dict[str, int]:
    if current_user.role != "SUPERADMIN":
        raise HTTPException(status_code=403, detail="Superadmin access required")
    maintenance_orders = 0
    low_stock_parts = 0
    draft_purchase_orders = 0
    expiring_documents = 0
    escalated_alerts = 0
    async with session.begin():
        components = await session.execute(
            text(
                'select c."id", c."name", c."vehicleId", c."lastServicedOdometer", '
                'c."expectedLifeKm", c."alertThresholdKm", v."currentOdometer", v."licensePlate" '
                'from "components" c join "vehicles" v on v."id" = c."vehicleId" '
                'where c."status" = \'ACTIVE\' and v."orgId" = :org_id'
            ),
            {"org_id": current_user.org_id},
        )
        for component in components.mappings():
            consumed = float(component["currentOdometer"]) - float(component["lastServicedOdometer"])
            if consumed < float(component["alertThresholdKm"]):
                continue
            existing = await session.execute(
                text(
                    'select "id" from "work_orders" where "orgId" = :org_id and "vehicleId" = :vehicle_id '
                    'and "status" in (\'OPEN\', \'IN_PROGRESS\', \'WAITING_FOR_PARTS\', \'READY_FOR_REVIEW\', \'REWORK\') '
                    'and "title" like :title limit 1'
                ),
                {
                    "org_id": current_user.org_id,
                    "vehicle_id": component["vehicleId"],
                    "title": f"%{component['name']}%",
                },
            )
            if existing.first() is not None:
                continue
            created = await session.execute(
                text(
                    'insert into "work_orders" ("orgId", "vehicleId", "title", "description", '
                    '"priority", "status") values (:org_id, :vehicle_id, :title, :description, '
                    '\'CRITICAL\', \'OPEN\') returning "id"'
                ),
                {
                    "org_id": current_user.org_id,
                    "vehicle_id": component["vehicleId"],
                    "title": f"{component['name']} service threshold reached",
                    "description": f"{component['name']}: {consumed:,.0f} km since last service.",
                },
            )
            work_order_id = created.scalar_one()
            await _notify_roles(
                session,
                current_user,
                ("SUPERADMIN", "FLEET_MANAGER"),
                "Maintenance lifecycle alert",
                f"{component['licensePlate']}: {component['name']} crossed its service threshold.",
                "MAINTENANCE_THRESHOLD",
                "WORK_ORDER",
                work_order_id,
            )
            maintenance_orders += 1

        parts = await session.execute(
            text(
                'select "id", "name", "sku", "quantityOnHand", "minReorderLevel", "unitCost" '
                'from "inventory_parts" where "orgId" = :org_id and "quantityOnHand" <= "minReorderLevel"'
            ),
            {"org_id": current_user.org_id},
        )
        for part in parts.mappings():
            low_stock_parts += 1
            await _notify_roles(
                session,
                current_user,
                ("SUPERADMIN", "INVENTORY_MANAGER"),
                "Inventory below reorder level",
                f"{part['name']} ({part['sku']}) has {part['quantityOnHand']} units remaining.",
                "INVENTORY_LOW",
                "INVENTORY_LOW",
                part["id"],
            )

        horizon = datetime.now(timezone.utc) + timedelta(days=30)
        documents = await session.execute(
            text(
                'select "id", "title", "expiryDate" from "documents" where "orgId" = :org_id '
                'and "archivedAt" is null and "expiryDate" <= :horizon'
            ),
            {"org_id": current_user.org_id, "horizon": horizon},
        )
        for document in documents.mappings():
            expiring_documents += 1
            await _notify_roles(
                session,
                current_user,
                ("SUPERADMIN", "FLEET_MANAGER"),
                "Compliance document expiring",
                f"{document['title']} expires on {document['expiryDate'].date().isoformat()}.",
                "DOCUMENT_EXPIRY",
                "DOCUMENT_EXPIRY",
                document["id"],
            )

        cutoff = datetime.now(timezone.utc) - timedelta(days=1)
        escalations = await session.execute(
            text(
                'update "notifications" set "escalationLevel" = 1, "updatedAt" = now() '
                'where "orgId" = :org_id and "severity" = \'CRITICAL\' and '
                '"acknowledgedAt" is null and "escalationLevel" = 0 and "createdAt" <= :cutoff '
                'returning "id"'
            ),
            {"org_id": current_user.org_id, "cutoff": cutoff},
        )
        escalated_alerts = len(list(escalations.mappings()))
    return {
        "organizations": 1,
        "maintenance_orders": maintenance_orders,
        "low_stock_parts": low_stock_parts,
        "draft_purchase_orders": draft_purchase_orders,
        "expiring_documents": expiring_documents,
        "escalated_alerts": escalated_alerts,
    }
