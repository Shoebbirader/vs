from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_db_session
from ..tenant import TenantUser, get_current_user

router = APIRouter(prefix="/api/v2", tags=["fleet"])


class VehicleSummary(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: str
    vin: str
    license_plate: str
    make: str
    model: str
    year: int | None
    current_odometer: float | None
    status: str


class DashboardSummary(BaseModel):
    vehicle_count: int
    active_vehicle_count: int
    open_work_order_count: int
    unread_notification_count: int


class VehicleCreate(BaseModel):
    vin: str = Field(min_length=5, max_length=32)
    license_plate: str = Field(min_length=1, max_length=32)
    make: str = Field(min_length=1, max_length=100)
    model: str = Field(min_length=1, max_length=100)
    year: int = Field(ge=1900, le=2200)
    current_odometer: float = Field(ge=0)
    status: str = Field(min_length=1, max_length=32)


@router.post("/vehicles", response_model=VehicleSummary, status_code=201)
async def create_vehicle(
    payload: VehicleCreate,
    current_user: TenantUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> VehicleSummary:
    if current_user.role not in {"SUPERADMIN", "FLEET_MANAGER"}:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Fleet manager access required",
        )
    async with session.begin():
        result = await session.execute(
            text(
                'insert into "vehicles" '
                '("orgId", "vin", "licensePlate", "make", "model", "year", '
                '"currentOdometer", "status") '
                "values (:org_id, :vin, :license_plate, :make, :model, :year, "
                ":current_odometer, :status) "
                'returning "id", "vin", "licensePlate", "make", "model", "year", '
                '"currentOdometer", "status"'
            ),
            {
                "org_id": current_user.org_id,
                "vin": payload.vin.strip().upper(),
                "license_plate": payload.license_plate.strip().upper(),
                "make": payload.make.strip(),
                "model": payload.model.strip(),
                "year": payload.year,
                "current_odometer": payload.current_odometer,
                "status": payload.status.strip().upper(),
            },
        )
        row = result.mappings().one()
    return VehicleSummary(
        id=str(row["id"]),
        vin=str(row["vin"]),
        license_plate=str(row["licensePlate"]),
        make=str(row["make"]),
        model=str(row["model"]),
        year=row["year"],
        current_odometer=float(row["currentOdometer"]),
        status=str(row["status"]),
    )


@router.get("/vehicles", response_model=list[VehicleSummary])
async def list_vehicles(
    current_user: TenantUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> list[VehicleSummary]:
    result = await session.execute(
        text(
            'select "id", "vin", "licensePlate", "make", "model", "year", '
            '"currentOdometer", "status" from "vehicles" '
            'where "orgId" = :org_id order by "licensePlate"'
        ),
        {"org_id": current_user.org_id},
    )
    return [
        VehicleSummary(
            id=str(row["id"]),
            vin=str(row["vin"]),
            license_plate=str(row["licensePlate"]),
            make=str(row["make"]),
            model=str(row["model"]),
            year=row["year"],
            current_odometer=float(row["currentOdometer"])
            if row["currentOdometer"] is not None
            else None,
            status=str(row["status"]),
        )
        for row in result.mappings()
    ]


@router.get("/dashboard/summary", response_model=DashboardSummary)
async def dashboard_summary(
    current_user: TenantUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> DashboardSummary:
    result = await session.execute(
        text(
            'select '
            '(select count(*) from "vehicles" where "orgId" = :org_id) as vehicle_count, '
            '(select count(*) from "vehicles" where "orgId" = :org_id and "status" = \'ACTIVE\') '
            "as active_vehicle_count, "
            '(select count(*) from "work_orders" where "orgId" = :org_id '
            'and "status" not in (\'COMPLETED\', \'CANCELLED\')) as open_work_order_count, '
            '(select count(*) from "notifications" where "orgId" = :org_id '
            'and "recipientId" = :user_id and "isRead" = false) as unread_notification_count'
        ),
        {"org_id": current_user.org_id, "user_id": current_user.id},
    )
    row = result.mappings().one()
    return DashboardSummary(
        vehicle_count=int(row["vehicle_count"]),
        active_vehicle_count=int(row["active_vehicle_count"]),
        open_work_order_count=int(row["open_work_order_count"]),
        unread_notification_count=int(row["unread_notification_count"]),
    )
