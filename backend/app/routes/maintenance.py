from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from typing import Literal

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


WorkOrderStatus = Literal[
    "OPEN",
    "IN_PROGRESS",
    "WAITING_FOR_PARTS",
    "READY_FOR_REVIEW",
    "REWORK",
    "CANCELLED",
]


class WorkOrderStatusUpdate(BaseModel):
    status: WorkOrderStatus
    expected_updated_at: datetime | None = None


class WorkOrderBulkUpdate(BaseModel):
    work_order_ids: list[UUID] = Field(min_length=1, max_length=100)
    priority: str | None = Field(default=None, min_length=1, max_length=32)
    assigned_mechanic_id: UUID | None = None
    scheduled_for: datetime | None = None
    archive: bool | None = None
    cancel: bool = False


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


@router.patch("/work-orders/{work_order_id}/status", response_model=WorkOrderSummary)
async def update_work_order_status(
    work_order_id: UUID,
    payload: WorkOrderStatusUpdate,
    current_user: TenantUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> WorkOrderSummary:
    if current_user.role not in {"FLEET_MANAGER", "MECHANIC", "TECHNICIAN"}:
        raise HTTPException(status_code=403, detail="Work-order status access required")
    role_scope = (
        'and "assignedMechanicId" = :actor_id'
        if current_user.role in {"MECHANIC", "TECHNICIAN"}
        else ""
    )
    async with session.begin():
        result = await session.execute(
            text(
                'select "id", "vehicleId", "title", "description", "priority", "status", '
                '"scheduledFor", "updatedAt", "startedAt" from "work_orders" '
                'where "id" = :work_order_id and "orgId" = :org_id ' + role_scope
            ),
            {
                "work_order_id": str(work_order_id),
                "org_id": current_user.org_id,
                "actor_id": current_user.id,
            },
        )
        order = result.mappings().first()
        if order is None:
            raise HTTPException(status_code=404, detail="Work order not found")
        allowed = {
            "OPEN": {"IN_PROGRESS", "CANCELLED"},
            "IN_PROGRESS": {"WAITING_FOR_PARTS", "READY_FOR_REVIEW", "REWORK", "CANCELLED"},
            "WAITING_FOR_PARTS": {"IN_PROGRESS", "CANCELLED"},
            "READY_FOR_REVIEW": {"COMPLETED", "REWORK"},
            "REWORK": {"IN_PROGRESS", "READY_FOR_REVIEW", "CANCELLED"},
            "COMPLETED": set(),
            "CANCELLED": set(),
        }
        role_allowed = (
            {"CANCELLED", "REWORK"}
            if current_user.role == "FLEET_MANAGER"
            else {"IN_PROGRESS", "WAITING_FOR_PARTS", "READY_FOR_REVIEW", "CANCELLED"}
        )
        if payload.status not in allowed.get(order["status"], set()) or payload.status not in role_allowed:
            raise HTTPException(
                status_code=403,
                detail=f"Cannot move work order from {order['status']} to {payload.status}",
            )
        if payload.expected_updated_at and order["updatedAt"] != payload.expected_updated_at:
            raise HTTPException(status_code=409, detail="Work order changed elsewhere")
        predicates = ['"id" = :work_order_id', '"orgId" = :org_id']
        params: dict[str, object] = {
            "work_order_id": str(work_order_id),
            "org_id": current_user.org_id,
            "status": payload.status,
        }
        if payload.expected_updated_at:
            predicates.append('"updatedAt" = :expected_updated_at')
            params["expected_updated_at"] = payload.expected_updated_at
        started_clause = (
            ', "startedAt" = coalesce("startedAt", now())'
            if payload.status == "IN_PROGRESS"
            else ""
        )
        updated = await session.execute(
            text(
                'update "work_orders" set "status" = :status'
                + started_clause
                + ', "updatedAt" = now() where '
                + " and ".join(predicates)
                + ' returning "id", "vehicleId", "title", "description", "priority", '
                '"status", "scheduledFor", "updatedAt"'
            ),
            params,
        )
        row = updated.mappings().first()
        if row is None:
            raise HTTPException(status_code=409, detail="Work order changed elsewhere")
    return WorkOrderSummary(
        id=row["id"], vehicle_id=row["vehicleId"], title=row["title"],
        description=row["description"], priority=row["priority"], status=row["status"],
        scheduled_for=row["scheduledFor"], updated_at=row["updatedAt"],
    )


@router.patch("/work-orders/bulk", response_model=dict[str, object])
async def bulk_update_work_orders(
    payload: WorkOrderBulkUpdate,
    current_user: TenantUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> dict[str, object]:
    if current_user.role not in {"SUPERADMIN", "FLEET_MANAGER"}:
        raise HTTPException(status_code=403, detail="Bulk work-order access required")
    assigned_requested = "assigned_mechanic_id" in payload.model_fields_set
    schedule_requested = "scheduled_for" in payload.model_fields_set
    archive_requested = "archive" in payload.model_fields_set
    if (
        payload.priority is None
        and not assigned_requested
        and not schedule_requested
        and not archive_requested
        and not payload.cancel
    ):
        raise HTTPException(status_code=400, detail="Choose a bulk work-order action")
    async with session.begin():
        if payload.assigned_mechanic_id:
            assignee = await session.execute(
                text(
                    'select "id" from "users" where "id" = :assignee_id '
                    'and "orgId" = :org_id and "role" in (\'MECHANIC\', \'TECHNICIAN\')'
                ),
                {
                    "assignee_id": str(payload.assigned_mechanic_id),
                    "org_id": current_user.org_id,
                },
            )
            if assignee.first() is None:
                raise HTTPException(status_code=400, detail="Assignee must belong to this organization")
        rows: list[dict[str, object]] = []
        skipped = 0
        for order_id in payload.work_order_ids:
            result = await session.execute(
                text(
                    'select "id", "vehicleId", "title", "description", "priority", "status", '
                    '"scheduledFor", "updatedAt" from "work_orders" where "id" = :order_id '
                    'and "orgId" = :org_id for update'
                ),
                {"order_id": str(order_id), "org_id": current_user.org_id},
            )
            order = result.mappings().first()
            if order is None:
                raise HTTPException(status_code=404, detail="One or more work orders are outside this organization")
            if payload.cancel and order["status"] in {"COMPLETED", "CANCELLED"}:
                skipped += 1
                continue
            assignments: list[str] = []
            params: dict[str, object] = {"order_id": str(order_id), "org_id": current_user.org_id}
            if payload.priority is not None:
                assignments.append('"priority" = :priority')
                params["priority"] = payload.priority.strip().upper()
            if assigned_requested:
                assignments.append('"assignedMechanicId" = :assignee_id')
                params["assignee_id"] = (
                    str(payload.assigned_mechanic_id)
                    if payload.assigned_mechanic_id
                    else None
                )
            if schedule_requested:
                assignments.append('"scheduledFor" = :scheduled_for')
                params["scheduled_for"] = payload.scheduled_for
            if archive_requested:
                assignments.append('"archivedAt" = :archived_at')
                params["archived_at"] = (
                    datetime.now(timezone.utc) if payload.archive else None
                )
            if payload.cancel:
                assignments.append('"status" = \'CANCELLED\'')
            assignments.append('"updatedAt" = now()')
            updated = await session.execute(
                text(
                    'update "work_orders" set ' + ", ".join(assignments)
                    + ' where "id" = :order_id and "orgId" = :org_id returning '
                    '"id", "vehicleId", "title", "description", "priority", "status", '
                    '"scheduledFor", "updatedAt"'
                ),
                params,
            )
            rows.append(dict(updated.mappings().one()))
    return {"updated": len(rows), "skipped": skipped, "workOrders": rows}
