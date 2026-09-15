from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_db_session
from ..tenant import TenantUser, get_current_user

router = APIRouter(prefix="/api/v2", tags=["maintenance"])


class WorkOrderSummary(BaseModel):
    id: UUID
    vehicle_id: UUID
    title: str
    description: str | None
    priority: str
    status: str
    scheduled_for: datetime | None
    updated_at: datetime


class WorkOrderCreate(BaseModel):
    vehicle_id: UUID
    title: str = Field(min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=5000)
    priority: str = Field(min_length=1, max_length=32)
    scheduled_for: datetime | None = None


@router.get("/work-orders", response_model=list[WorkOrderSummary])
async def list_work_orders(
    vehicle_id: UUID | None = None,
    work_order_status: str | None = Query(default=None, alias="status"),
    current_user: TenantUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> list[WorkOrderSummary]:
    result = await session.execute(
        text(
            'select "id", "vehicleId", "title", "description", "priority", "status", '
            '"scheduledFor", "updatedAt" from "work_orders" '
            'where "orgId" = :org_id '
            'and (:vehicle_id is null or "vehicleId" = :vehicle_id) '
            'and (:work_order_status is null or "status" = :work_order_status) '
            'order by "updatedAt" desc'
        ),
        {
            "org_id": current_user.org_id,
            "vehicle_id": str(vehicle_id) if vehicle_id else None,
            "work_order_status": work_order_status,
        },
    )
    return [
        WorkOrderSummary(
            id=row["id"],
            vehicle_id=row["vehicleId"],
            title=row["title"],
            description=row["description"],
            priority=row["priority"],
            status=row["status"],
            scheduled_for=row["scheduledFor"],
            updated_at=row["updatedAt"],
        )
        for row in result.mappings()
    ]


@router.post("/work-orders", response_model=WorkOrderSummary, status_code=201)
async def create_work_order(
    payload: WorkOrderCreate,
    current_user: TenantUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> WorkOrderSummary:
    if current_user.role not in {
        "SUPERADMIN",
        "FLEET_MANAGER",
        "MECHANIC",
        "TECHNICIAN",
    }:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Maintenance access required",
        )
    async with session.begin():
        vehicle = await session.execute(
            text('select "id" from "vehicles" where "id" = :vehicle_id and "orgId" = :org_id'),
            {"vehicle_id": str(payload.vehicle_id), "org_id": current_user.org_id},
        )
        if vehicle.first() is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Vehicle not found",
            )
        result = await session.execute(
            text(
                'insert into "work_orders" '
                '("orgId", "vehicleId", "title", "description", "priority", "status", '
                '"scheduledFor") values (:org_id, :vehicle_id, :title, :description, '
                ':priority, \'OPEN\', :scheduled_for) returning "id", "vehicleId", '
                '"title", "description", "priority", "status", "scheduledFor", "updatedAt"'
            ),
            {
                "org_id": current_user.org_id,
                "vehicle_id": str(payload.vehicle_id),
                "title": payload.title.strip(),
                "description": payload.description.strip()
                if payload.description
                else None,
                "priority": payload.priority.strip().upper(),
                "scheduled_for": payload.scheduled_for,
            },
        )
        row = result.mappings().one()
    return WorkOrderSummary(
        id=row["id"],
        vehicle_id=row["vehicleId"],
        title=row["title"],
        description=row["description"],
        priority=row["priority"],
        status=row["status"],
        scheduled_for=row["scheduledFor"],
        updated_at=row["updatedAt"],
    )
