from datetime import datetime, timedelta, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_db_session
from ..tenant import TenantUser, get_current_user

router = APIRouter(prefix="/api/v2", tags=["planning"])


class PlanningItem(BaseModel):
    id: UUID
    kind: str
    title: str
    vehicle_id: UUID | None
    due_date: datetime
    priority: str
    detail: str
    source_id: UUID


class PlanningSummary(BaseModel):
    from_date: datetime
    to_date: datetime
    items: list[PlanningItem]
    counts: dict[str, int]


@router.get("/planning/maintenance", response_model=PlanningSummary)
async def maintenance_planning(
    from_date: datetime | None = None,
    to_date: datetime | None = None,
    current_user: TenantUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> PlanningSummary:
    if current_user.role not in {"SUPERADMIN", "FLEET_MANAGER"}:
        raise HTTPException(status_code=403, detail="Fleet manager access required")
    start = from_date or datetime.now(timezone.utc)
    end = to_date or start + timedelta(days=90)
    if end < start:
        raise HTTPException(status_code=400, detail="Planning end date must follow start date")

    components = await session.execute(
        text(
            'select c."id", c."vehicleId", c."name", c."alertThresholdKm", '
            'c."lastServicedOdometer", v."currentOdometer" from "components" c '
            'join "vehicles" v on v."id" = c."vehicleId" and v."orgId" = :org_id '
            'where c."status" = \'ACTIVE\' and '
            '(v."currentOdometer" - c."lastServicedOdometer") >= c."alertThresholdKm"'
        ),
        {"org_id": current_user.org_id},
    )
    documents = await session.execute(
        text(
            'select "id", "vehicleId", "title", "docType", "expiryDate" '
            'from "documents" where "orgId" = :org_id and "archivedAt" is null '
            'and "expiryDate" between :start_date and :end_date'
        ),
        {"org_id": current_user.org_id, "start_date": start, "end_date": end},
    )
    work_orders = await session.execute(
        text(
            'select "id", "vehicleId", "title", "priority", "status", "updatedAt" '
            'from "work_orders" where "orgId" = :org_id and "status" in '
            "('OPEN', 'IN_PROGRESS', 'WAITING_FOR_PARTS', 'READY_FOR_REVIEW', 'REWORK') "
            'and "updatedAt" between :start_date and :end_date'
        ),
        {"org_id": current_user.org_id, "start_date": start, "end_date": end},
    )
    items: list[PlanningItem] = []
    for row in components.mappings():
        items.append(
            PlanningItem(
                id=row["id"],
                kind="COMPONENT_DUE",
                title=f'{row["name"]} service due',
                vehicle_id=row["vehicleId"],
                due_date=start,
                priority="HIGH",
                detail=f'{float(row["currentOdometer"]) - float(row["lastServicedOdometer"]):,.0f} km since last service',
                source_id=row["id"],
            )
        )
    for row in documents.mappings():
        items.append(
            PlanningItem(
                id=row["id"],
                kind="DOCUMENT_EXPIRY",
                title=f'{row["title"]} expires',
                vehicle_id=row["vehicleId"],
                due_date=row["expiryDate"],
                priority="CRITICAL"
                if row["expiryDate"] <= start + timedelta(days=30)
                else "MEDIUM",
                detail=f'{row["docType"]} renewal required',
                source_id=row["id"],
            )
        )
    for row in work_orders.mappings():
        items.append(
            PlanningItem(
                id=row["id"],
                kind="WORK_ORDER",
                title=row["title"],
                vehicle_id=row["vehicleId"],
                due_date=row["updatedAt"],
                priority=row["priority"],
                detail=f'{row["status"]} work order',
                source_id=row["id"],
            )
        )
    items.sort(key=lambda item: item.due_date)
    return PlanningSummary(
        from_date=start,
        to_date=end,
        items=items,
        counts={
            "total": len(items),
            "components": sum(item.kind == "COMPONENT_DUE" for item in items),
            "documents": sum(item.kind == "DOCUMENT_EXPIRY" for item in items),
            "work_orders": sum(item.kind == "WORK_ORDER" for item in items),
        },
    )
