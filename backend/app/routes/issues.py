from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_db_session
from ..tenant import TenantUser, get_current_user

router = APIRouter(prefix="/api/v2", tags=["vehicle-issues"])


class VehicleIssueCreate(BaseModel):
    vehicle_id: UUID
    title: str = Field(min_length=3, max_length=160)
    description: str = Field(min_length=5, max_length=4000)
    priority: str = Field(pattern="^(LOW|MEDIUM|HIGH|CRITICAL)$")


class VehicleIssueSummary(BaseModel):
    id: UUID
    vehicle_id: UUID
    driver_id: UUID
    title: str
    description: str
    priority: str
    status: str
    photo_url: str | None
    created_at: datetime


@router.get("/vehicle-issues", response_model=list[VehicleIssueSummary])
async def list_vehicle_issues(
    current_user: TenantUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> list[VehicleIssueSummary]:
    result = await session.execute(
        text(
            'select "id", "vehicleId", "driverId", "title", "description", '
            '"priority", "status", "photoUrl", "createdAt" from "vehicle_issues" '
            'where "orgId" = :org_id order by "createdAt" desc limit 100'
        ),
        {"org_id": current_user.org_id},
    )
    return [
        VehicleIssueSummary(
            id=row["id"],
            vehicle_id=row["vehicleId"],
            driver_id=row["driverId"],
            title=row["title"],
            description=row["description"],
            priority=row["priority"],
            status=row["status"],
            photo_url=row["photoUrl"],
            created_at=row["createdAt"],
        )
        for row in result.mappings()
    ]


@router.post("/vehicle-issues", response_model=VehicleIssueSummary, status_code=201)
async def create_vehicle_issue(
    payload: VehicleIssueCreate,
    current_user: TenantUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> VehicleIssueSummary:
    if current_user.role not in {"DRIVER", "SUPERADMIN"}:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Driver access required",
        )
    async with session.begin():
        vehicle = await session.execute(
            text(
                'select "id" from "vehicles" where "id" = :vehicle_id '
                'and "orgId" = :org_id'
            ),
            {"vehicle_id": str(payload.vehicle_id), "org_id": current_user.org_id},
        )
        if vehicle.first() is None:
            raise HTTPException(status_code=404, detail="Vehicle not found")
        if current_user.role == "DRIVER":
            assignment = await session.execute(
                text(
                    'select 1 from "vehicle_assignments" where "orgId" = :org_id '
                    'and "vehicleId" = :vehicle_id and "driverId" = :driver_id '
                    'and "active" = true'
                ),
                {
                    "org_id": current_user.org_id,
                    "vehicle_id": str(payload.vehicle_id),
                    "driver_id": current_user.id,
                },
            )
            if assignment.first() is None:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Vehicle is not assigned to this driver",
                )
        result = await session.execute(
            text(
                'insert into "vehicle_issues" '
                '("orgId", "vehicleId", "driverId", "title", "description", '
                '"priority", "status", "createdById", "updatedById") '
                'values (:org_id, :vehicle_id, :driver_id, :title, '
                ':description, :priority, :issue_status, :actor_id, :actor_id) '
                'returning "id", "vehicleId", "driverId", "title", "description", '
                '"priority", "status", "photoUrl", "createdAt"'
            ),
            {
                "org_id": current_user.org_id,
                "vehicle_id": str(payload.vehicle_id),
                "driver_id": current_user.id,
                "title": payload.title.strip(),
                "description": payload.description.strip(),
                "priority": payload.priority,
                "issue_status": "OPEN",
                "actor_id": current_user.id,
            },
        )
        row = result.mappings().one()
    return VehicleIssueSummary(
        id=row["id"],
        vehicle_id=row["vehicleId"],
        driver_id=row["driverId"],
        title=row["title"],
        description=row["description"],
        priority=row["priority"],
        status=row["status"],
        photo_url=row["photoUrl"],
        created_at=row["createdAt"],
    )
