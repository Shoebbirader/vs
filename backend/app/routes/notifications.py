from datetime import datetime
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_db_session
from ..tenant import TenantUser, get_current_user

router = APIRouter(prefix="/api/v2", tags=["notifications"])


class NotificationSummary(BaseModel):
    id: UUID
    title: str
    message: str
    type: str
    severity: str
    source_type: str
    reference_id: UUID | None
    is_read: bool
    acknowledged_at: datetime | None
    escalation_level: int
    resolved_at: datetime | None
    created_at: datetime


class ResolveNotification(BaseModel):
    note: str = Field(min_length=3, max_length=500)


def _notification(row: dict[str, object]) -> NotificationSummary:
    return NotificationSummary(
        id=row["id"],
        title=row["title"],
        message=row["message"],
        type=row["type"],
        severity=row["severity"],
        source_type=row["sourceType"],
        reference_id=row["referenceId"],
        is_read=row["isRead"],
        acknowledged_at=row["acknowledgedAt"],
        escalation_level=row["escalationLevel"],
        resolved_at=row["resolvedAt"],
        created_at=row["createdAt"],
    )


async def _owned_notification(
    notification_id: UUID,
    user: TenantUser,
    session: AsyncSession,
) -> dict[str, object]:
    result = await session.execute(
        text(
            'select "id", "title", "message", "type", "severity", "sourceType", '
            '"referenceId", "isRead", "acknowledgedAt", "escalationLevel", '
            '"resolvedAt", "createdAt" from "notifications" where "id" = :id '
            'and "orgId" = :org_id and "recipientId" = :recipient_id'
        ),
        {
            "id": str(notification_id),
            "org_id": user.org_id,
            "recipient_id": user.id,
        },
    )
    row = result.mappings().first()
    if row is None:
        raise HTTPException(status_code=404, detail="Notification not found")
    return row


@router.get("/notifications", response_model=list[NotificationSummary])
async def list_notifications(
    severity: str = "ALL",
    source_type: str = "ALL",
    notification_status: str = "ALL",
    vehicle_id: UUID | None = None,
    current_user: TenantUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> list[NotificationSummary]:
    clauses = [
        '"orgId" = :org_id',
        '"recipientId" = :recipient_id',
    ]
    params: dict[str, object] = {
        "org_id": current_user.org_id,
        "recipient_id": current_user.id,
    }
    if severity != "ALL":
        clauses.append('"severity" = :severity')
        params["severity"] = severity
    if source_type != "ALL":
        clauses.append('"sourceType" = :source_type')
        params["source_type"] = source_type
    if notification_status == "UNREAD":
        clauses.append('"isRead" = false')
    elif notification_status == "READ":
        clauses.append('"isRead" = true')
    elif notification_status == "OPEN":
        clauses.append('"resolvedAt" is null')
    elif notification_status == "RESOLVED":
        clauses.append('"resolvedAt" is not null')
    if vehicle_id:
        clauses.append(
            '("referenceId" = :vehicle_id or "referenceId" in '
            '(select "id" from "work_orders" where "vehicleId" = :vehicle_id and "orgId" = :org_id) '
            'or "referenceId" in (select "id" from "vehicle_issues" where "vehicleId" = :vehicle_id '
            'and "orgId" = :org_id))'
        )
        params["vehicle_id"] = str(vehicle_id)
    result = await session.execute(
        text(
            'select "id", "title", "message", "type", "severity", "sourceType", "referenceId", '
            '"isRead", "acknowledgedAt", "escalationLevel", "resolvedAt", "createdAt" '
            'from "notifications" where ' + " and ".join(clauses) +
            ' order by "resolvedAt" asc nulls first, "createdAt" desc limit 100'
        ),
        params,
    )
    return [_notification(row) for row in result.mappings()]


@router.patch("/notifications/{notification_id}/read", response_model=NotificationSummary)
async def mark_notification_read(
    notification_id: UUID,
    current_user: TenantUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> NotificationSummary:
    async with session.begin():
        await session.execute(
            text(
                'update "notifications" set "isRead" = true, '
                '"acknowledgedAt" = coalesce("acknowledgedAt", now()), "updatedAt" = now() '
                'where "id" = :id and "orgId" = :org_id and "recipientId" = :recipient_id'
            ),
            {"id": str(notification_id), "org_id": current_user.org_id, "recipient_id": current_user.id},
        )
        row = await _owned_notification(notification_id, current_user, session)
    return _notification(row)


@router.post("/notifications/{notification_id}/escalate", response_model=NotificationSummary)
async def escalate_notification(
    notification_id: UUID,
    current_user: TenantUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> NotificationSummary:
    if current_user.role not in {"SUPERADMIN", "FLEET_MANAGER"}:
        raise HTTPException(status_code=403, detail="Fleet management access required")
    async with session.begin():
        result = await session.execute(
            text(
                'update "notifications" set "escalationLevel" = "escalationLevel" + 1, '
                '"isRead" = false, "updatedAt" = now() where "id" = :id and "orgId" = :org_id '
                'and "resolvedAt" is null returning "id", "title", "message", "type", "severity", '
                '"sourceType", "referenceId", "isRead", "acknowledgedAt", "escalationLevel", '
                '"resolvedAt", "createdAt"'
            ),
            {"id": str(notification_id), "org_id": current_user.org_id},
        )
        row = result.mappings().first()
        if row is None:
            raise HTTPException(status_code=409, detail="Notification was resolved elsewhere or not found")
        managers = await session.execute(
            text(
                'select "id" from "users" where "orgId" = :org_id and "role" in '
                "('SUPERADMIN', 'FLEET_MANAGER') and \"id\" <> :actor_id"
            ),
            {"org_id": current_user.org_id, "actor_id": current_user.id},
        )
        for manager in managers.mappings():
            await session.execute(
                text(
                    'insert into "notifications" ("id", "orgId", "recipientId", "title", "message", '
                    '"type", "severity", "sourceType", "referenceId", "isRead") values '
                    '(:id, :org_id, :recipient_id, :title, :message, \'ALERT_ESCALATION\', '
                    '\'CRITICAL\', \'ALERT_ESCALATION\', :reference_id, false)'
                ),
                {
                    "id": str(uuid4()),
                    "org_id": current_user.org_id,
                    "recipient_id": manager["id"],
                    "title": f"Escalation alert: {row['title']}",
                    "message": f"Notification escalated to level {row['escalationLevel']}",
                    "reference_id": row["referenceId"],
                },
            )
    return _notification(row)


@router.post("/notifications/{notification_id}/resolve", response_model=NotificationSummary)
async def resolve_notification(
    notification_id: UUID,
    payload: ResolveNotification,
    current_user: TenantUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> NotificationSummary:
    if current_user.role not in {"SUPERADMIN", "FLEET_MANAGER"}:
        raise HTTPException(status_code=403, detail="Fleet management access required")
    async with session.begin():
        current = await session.execute(
            text(
                'select "id", "title", "sourceType", "referenceId", "resolvedAt" from "notifications" '
                'where "id" = :id and "orgId" = :org_id for update'
            ),
            {"id": str(notification_id), "org_id": current_user.org_id},
        )
        source = current.mappings().first()
        if source is None:
            raise HTTPException(status_code=404, detail="Notification not found")
        if source["resolvedAt"] is None and source["referenceId"]:
            checks = {
                "VEHICLE_ISSUE": ('select "status" from "vehicle_issues" where "id" = :reference_id and "orgId" = :org_id', {"RESOLVED", "CLOSED"}),
                "WORK_ORDER": ('select "status" from "work_orders" where "id" = :reference_id and "orgId" = :org_id', {"COMPLETED"}),
                "VEHICLE": ('select "status" from "vehicles" where "id" = :reference_id and "orgId" = :org_id', {"ACTIVE"}),
            }
            if source["sourceType"] in checks:
                query, allowed = checks[source["sourceType"]]
                check = await session.execute(text(query), {"reference_id": source["referenceId"], "org_id": current_user.org_id})
                status_row = check.first()
                if status_row is None or status_row[0] not in allowed:
                    raise HTTPException(status_code=400, detail="Resolve the source entity before closing this notification")
        result = await session.execute(
            text(
                'update "notifications" set "isRead" = true, "acknowledgedAt" = coalesce("acknowledgedAt", now()), '
                '"resolvedAt" = coalesce("resolvedAt", now()), "updatedAt" = now() where "id" = :id '
                'and "orgId" = :org_id returning "id", "title", "message", "type", "severity", "sourceType", '
                '"referenceId", "isRead", "acknowledgedAt", "escalationLevel", "resolvedAt", "createdAt"'
            ),
            {"id": str(notification_id), "org_id": current_user.org_id},
        )
        row = result.mappings().one()
    return _notification(row)
