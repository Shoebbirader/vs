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


class DriverAssignment(BaseModel):
    vehicle_id: UUID
    vin: str
    license_plate: str
    make: str
    model: str


class FuelLogCreate(BaseModel):
    vehicle_id: UUID
    liters: float = Field(gt=0)
    amount: float = Field(ge=0)
    odometer: float = Field(ge=0)
    station: str | None = Field(default=None, max_length=200)


class FuelLogSummary(BaseModel):
    id: UUID
    vehicle_id: UUID
    driver_id: UUID
    liters: float
    amount: float
    odometer: float
    station: str | None
    created_at: datetime


@router.get("/driver/assignment", response_model=DriverAssignment | None)
async def current_assignment(
    current_user: TenantUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> DriverAssignment | None:
    result = await session.execute(
        text(
            'select v."id", v."vin", v."licensePlate", v."make", v."model" '
            'from "vehicle_assignments" a join "vehicles" v '
            'on v."id" = a."vehicleId" and v."orgId" = a."orgId" '
            'where a."orgId" = :org_id and a."driverId" = :driver_id '
            'and a."active" = true limit 1'
        ),
        {"org_id": current_user.org_id, "driver_id": current_user.id},
    )
    row = result.mappings().first()
    if row is None:
        return None
    return DriverAssignment(
        vehicle_id=row["id"],
        vin=row["vin"],
        license_plate=row["licensePlate"],
        make=row["make"],
        model=row["model"],
    )


@router.get("/driver/fuel-logs", response_model=list[FuelLogSummary])
async def list_fuel_logs(
    current_user: TenantUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> list[FuelLogSummary]:
    result = await session.execute(
        text(
            'select "id", "vehicleId", "driverId", "liters", "amount", '
            '"odometer", "station", "createdAt" from "fuel_logs" '
            'where "orgId" = :org_id and "driverId" = :driver_id '
            'order by "createdAt" desc limit 50'
        ),
        {"org_id": current_user.org_id, "driver_id": current_user.id},
    )
    return [
        FuelLogSummary(
            id=row["id"],
            vehicle_id=row["vehicleId"],
            driver_id=row["driverId"],
            liters=float(row["liters"]),
            amount=float(row["amount"]),
            odometer=float(row["odometer"]),
            station=row["station"],
            created_at=row["createdAt"],
        )
        for row in result.mappings()
    ]


@router.post("/driver/fuel-logs", response_model=FuelLogSummary, status_code=201)
async def create_fuel_log(
    payload: FuelLogCreate,
    current_user: TenantUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> FuelLogSummary:
    if current_user.role not in {"DRIVER", "SUPERADMIN"}:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Driver access required",
        )
    async with session.begin():
        vehicle = await session.execute(
            text(
                'select "id", "currentOdometer" from "vehicles" '
                'where "id" = :vehicle_id and "orgId" = :org_id'
            ),
            {"vehicle_id": str(payload.vehicle_id), "org_id": current_user.org_id},
        )
        vehicle_row = vehicle.mappings().first()
        if vehicle_row is None:
            raise HTTPException(status_code=404, detail="Vehicle not found")
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
        if current_user.role == "DRIVER" and assignment.first() is None:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Vehicle is not assigned to this driver",
            )
        if payload.odometer < float(vehicle_row["currentOdometer"]):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Odometer reading cannot move backwards",
            )
        result = await session.execute(
            text(
                'insert into "fuel_logs" '
                '("orgId", "vehicleId", "driverId", "liters", "amount", '
                '"odometer", "station", "createdById", "updatedById") '
                'values (:org_id, :vehicle_id, :driver_id, :liters, :amount, '
                ':odometer, :station, :actor_id, :actor_id) returning '
                '"id", "vehicleId", "driverId", "liters", "amount", '
                '"odometer", "station", "createdAt"'
            ),
            {
                "org_id": current_user.org_id,
                "vehicle_id": str(payload.vehicle_id),
                "driver_id": current_user.id,
                "liters": payload.liters,
                "amount": payload.amount,
                "odometer": payload.odometer,
                "station": payload.station.strip() if payload.station else None,
                "actor_id": current_user.id,
            },
        )
        row = result.mappings().one()
        await session.execute(
            text(
                'insert into "financial_records" '
                '("orgId", "vehicleId", "type", "category", "amount", '
                '"transactionDate") values (:org_id, :vehicle_id, :type, '
                ':category, :amount, now())'
            ),
            {
                "org_id": current_user.org_id,
                "vehicle_id": str(payload.vehicle_id),
                "type": "EXPENSE",
                "category": "FUEL",
                "amount": payload.amount,
            },
        )
        await session.execute(
            text(
                'insert into "odometer_logs" '
                '("id", "vehicleId", "driverId", "reading", "source", '
                '"isFlagged", "createdAt") values (gen_random_uuid(), '
                ':vehicle_id, :driver_id, :reading, :source, false, now())'
            ),
            {
                "vehicle_id": str(payload.vehicle_id),
                "driver_id": current_user.id,
                "reading": payload.odometer,
                "source": "MANUAL_DRIVER",
            },
        )
        await session.execute(
            text(
                'update "vehicles" set "currentOdometer" = :odometer, '
                '"updatedAt" = now() where "id" = :vehicle_id and "orgId" = :org_id'
            ),
            {
                "odometer": payload.odometer,
                "vehicle_id": str(payload.vehicle_id),
                "org_id": current_user.org_id,
            },
        )
    return FuelLogSummary(
        id=row["id"],
        vehicle_id=row["vehicleId"],
        driver_id=row["driverId"],
        liters=float(row["liters"]),
        amount=float(row["amount"]),
        odometer=float(row["odometer"]),
        station=row["station"],
        created_at=row["createdAt"],
    )


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
