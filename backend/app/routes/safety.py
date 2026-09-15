from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_db_session
from ..tenant import TenantUser, get_current_user

router = APIRouter(prefix="/api/v2", tags=["safety"])


class InspectionCreate(BaseModel):
    vehicle_id: UUID
    inspection_type: str = Field(pattern="^(PRE_TRIP|POST_TRIP)$")
    inspection_status: str = Field(pattern="^(PASS|FAIL)$", alias="status")
    notes: str | None = Field(default=None, max_length=2000)


class InspectionSummary(BaseModel):
    id: UUID
    vehicle_id: UUID
    driver_id: UUID
    inspection_type: str
    status: str
    notes: str | None
    created_at: datetime


@router.post("/driver/inspections", response_model=InspectionSummary, status_code=201)
async def create_inspection(
    payload: InspectionCreate,
    current_user: TenantUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> InspectionSummary:
    if current_user.role not in {"DRIVER", "SUPERADMIN"}:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Driver access required",
        )
    async with session.begin():
        vehicle = await session.execute(
            text(
                'select "id" from "vehicles" where "id" = :vehicle_id and "orgId" = :org_id'
            ),
            {"vehicle_id": str(payload.vehicle_id), "org_id": current_user.org_id},
        )
        if vehicle.first() is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Vehicle not found",
            )
        if current_user.role == "DRIVER":
            assignment = await session.execute(
                text(
                    'select 1 from "vehicle_assignments" where "orgId" = :org_id '
                    'and "vehicleId" = :vehicle_id and "driverId" = :driver_id and "active" = true'
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
                'insert into "dvir_inspections" '
                '("orgId", "vehicleId", "driverId", "inspectionType", "status", "notes") '
                "values (:org_id, :vehicle_id, :driver_id, :inspection_type, :inspection_status, "
                ":notes) returning \"id\", \"vehicleId\", \"driverId\", \"inspectionType\", "
                '"status", "notes", "createdAt"'
            ),
            {
                "org_id": current_user.org_id,
                "vehicle_id": str(payload.vehicle_id),
                "driver_id": current_user.id,
                "inspection_type": payload.inspection_type,
                "inspection_status": payload.inspection_status,
                "notes": payload.notes.strip() if payload.notes else None,
            },
        )
        row = result.mappings().one()
    return InspectionSummary(
        id=row["id"],
        vehicle_id=row["vehicleId"],
        driver_id=row["driverId"],
        inspection_type=row["inspectionType"],
        status=row["status"],
        notes=row["notes"],
        created_at=row["createdAt"],
    )
