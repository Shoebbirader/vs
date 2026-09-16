from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_db_session
from ..tenant import TenantUser, get_current_user

router = APIRouter(prefix="/api/v2", tags=["components"])


class ComponentSummary(BaseModel):
    id: UUID
    vehicle_id: UUID
    inventory_part_id: UUID | None
    name: str
    component_type: str
    component_subtype: str | None
    brand: str | None
    part_number: str | None
    serial_number: str | None
    installation_date: datetime
    expected_life_km: float
    expected_life_days: int | None
    last_serviced_odometer: float
    alert_threshold_km: float
    alert_threshold_days: int | None
    notes: str | None
    status: str


class ComponentCreate(BaseModel):
    vehicle_id: UUID
    inventory_part_id: UUID | None = None
    name: str = Field(min_length=2, max_length=200)
    component_type: str = Field(default="OTHER", max_length=80)
    component_subtype: str | None = Field(default=None, max_length=120)
    brand: str | None = Field(default=None, max_length=120)
    part_number: str | None = Field(default=None, max_length=120)
    serial_number: str | None = Field(default=None, max_length=120)
    installation_date: datetime | None = None
    expected_life_km: float = Field(gt=0)
    expected_life_days: int | None = Field(default=None, gt=0)
    last_serviced_odometer: float = Field(ge=0)
    alert_threshold_km: float = Field(gt=0)
    alert_threshold_days: int | None = Field(default=None, gt=0)
    notes: str | None = Field(default=None, max_length=2000)
    status: str = Field(default="ACTIVE", pattern="^(ACTIVE|REPLACED|REMOVED)$")


class ComponentUpdate(BaseModel):
    inventory_part_id: UUID | None = None
    name: str | None = Field(default=None, min_length=2, max_length=200)
    component_type: str | None = Field(default=None, max_length=80)
    component_subtype: str | None = Field(default=None, max_length=120)
    brand: str | None = Field(default=None, max_length=120)
    part_number: str | None = Field(default=None, max_length=120)
    serial_number: str | None = Field(default=None, max_length=120)
    installation_date: datetime | None = None
    expected_life_km: float | None = Field(default=None, gt=0)
    expected_life_days: int | None = Field(default=None, gt=0)
    last_serviced_odometer: float | None = Field(default=None, ge=0)
    alert_threshold_km: float | None = Field(default=None, gt=0)
    alert_threshold_days: int | None = Field(default=None, gt=0)
    notes: str | None = Field(default=None, max_length=2000)
    status: str | None = Field(default=None, pattern="^(ACTIVE|REPLACED|REMOVED)$")


def _component(row: dict[str, object]) -> ComponentSummary:
    return ComponentSummary(
        id=row["id"],
        vehicle_id=row["vehicleId"],
        inventory_part_id=row["inventoryPartId"],
        name=row["name"],
        component_type=row["componentType"],
        component_subtype=row["componentSubtype"],
        brand=row["brand"],
        part_number=row["partNumber"],
        serial_number=row["serialNumber"],
        installation_date=row["installationDate"],
        expected_life_km=float(row["expectedLifeKm"]),
        expected_life_days=row["expectedLifeDays"],
        last_serviced_odometer=float(row["lastServicedOdometer"]),
        alert_threshold_km=float(row["alertThresholdKm"]),
        alert_threshold_days=row["alertThresholdDays"],
        notes=row["notes"],
        status=row["status"],
    )


@router.get("/components", response_model=list[ComponentSummary])
async def list_components(
    vehicle_id: UUID | None = None,
    current_user: TenantUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> list[ComponentSummary]:
    result = await session.execute(
        text(
            'select c."id", c."vehicleId", c."inventoryPartId", c."name", '
            'c."componentType", c."componentSubtype", c."brand", c."partNumber", '
            'c."serialNumber", c."installationDate", c."expectedLifeKm", '
            'c."expectedLifeDays", c."lastServicedOdometer", c."alertThresholdKm", '
            'c."alertThresholdDays", c."notes", c."status" from "components" c '
            'join "vehicles" v on v."id" = c."vehicleId" and v."orgId" = :org_id '
            'where (:vehicle_id is null or c."vehicleId" = :vehicle_id) '
            'order by c."name"'
        ),
        {"org_id": current_user.org_id, "vehicle_id": str(vehicle_id) if vehicle_id else None},
    )
    return [_component(row) for row in result.mappings()]


@router.post("/components", response_model=ComponentSummary, status_code=201)
async def create_component(
    payload: ComponentCreate,
    current_user: TenantUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> ComponentSummary:
    if current_user.role not in {"SUPERADMIN", "FLEET_MANAGER", "MECHANIC"}:
        raise HTTPException(status_code=403, detail="Component management access required")
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
        if payload.inventory_part_id:
            part = await session.execute(
                text(
                    'select "id" from "inventory_parts" where "id" = :part_id '
                    'and "orgId" = :org_id'
                ),
                {"part_id": str(payload.inventory_part_id), "org_id": current_user.org_id},
            )
            if part.first() is None:
                raise HTTPException(status_code=400, detail="Inventory part not found")
        result = await session.execute(
            text(
                'insert into "components" '
                '("vehicleId", "inventoryPartId", "name", "componentType", '
                '"componentSubtype", "brand", "partNumber", "serialNumber", '
                '"installationDate", "expectedLifeKm", "expectedLifeDays", '
                '"lastServicedOdometer", "alertThresholdKm", "alertThresholdDays", '
                '"notes", "status") values (:vehicle_id, :inventory_part_id, '
                ':name, :component_type, :component_subtype, :brand, :part_number, '
                ':serial_number, coalesce(:installation_date, now()), :expected_life_km, '
                ':expected_life_days, :last_serviced_odometer, :alert_threshold_km, '
                ':alert_threshold_days, :notes, :component_status) returning '
                '"id", "vehicleId", "inventoryPartId", "name", "componentType", '
                '"componentSubtype", "brand", "partNumber", "serialNumber", '
                '"installationDate", "expectedLifeKm", "expectedLifeDays", '
                '"lastServicedOdometer", "alertThresholdKm", "alertThresholdDays", '
                '"notes", "status"'
            ),
            {
                "vehicle_id": str(payload.vehicle_id),
                "inventory_part_id": str(payload.inventory_part_id)
                if payload.inventory_part_id
                else None,
                "name": payload.name.strip(),
                "component_type": payload.component_type,
                "component_subtype": payload.component_subtype,
                "brand": payload.brand,
                "part_number": payload.part_number,
                "serial_number": payload.serial_number,
                "installation_date": payload.installation_date,
                "expected_life_km": payload.expected_life_km,
                "expected_life_days": payload.expected_life_days,
                "last_serviced_odometer": payload.last_serviced_odometer,
                "alert_threshold_km": payload.alert_threshold_km,
                "alert_threshold_days": payload.alert_threshold_days,
                "notes": payload.notes,
                "component_status": payload.status,
            },
        )
        row = result.mappings().one()
    return _component(row)


@router.patch("/components/{component_id}", response_model=ComponentSummary)
async def update_component(
    component_id: UUID,
    payload: ComponentUpdate,
    current_user: TenantUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> ComponentSummary:
    if current_user.role not in {"SUPERADMIN", "FLEET_MANAGER", "MECHANIC"}:
        raise HTTPException(status_code=403, detail="Component management access required")
    values = payload.model_dump(exclude_unset=True)
    if not values:
        raise HTTPException(status_code=400, detail="At least one component field is required")
    column_map = {
        "inventory_part_id": '"inventoryPartId"',
        "name": '"name"',
        "component_type": '"componentType"',
        "component_subtype": '"componentSubtype"',
        "brand": '"brand"',
        "part_number": '"partNumber"',
        "serial_number": '"serialNumber"',
        "installation_date": '"installationDate"',
        "expected_life_km": '"expectedLifeKm"',
        "expected_life_days": '"expectedLifeDays"',
        "last_serviced_odometer": '"lastServicedOdometer"',
        "alert_threshold_km": '"alertThresholdKm"',
        "alert_threshold_days": '"alertThresholdDays"',
        "notes": '"notes"',
        "status": '"status"',
    }
    assignments = [
        f"{column_map[key]} = :{key}" for key in values if key in column_map
    ]
    if len(assignments) != len(values):
        raise HTTPException(status_code=400, detail="Unsupported component field")
    if "name" in values:
        values["name"] = str(values["name"]).strip()
    async with session.begin():
        existing = await session.execute(
            text(
                'select c."id", c."vehicleId" from "components" c join "vehicles" v '
                'on v."id" = c."vehicleId" and v."orgId" = :org_id '
                'where c."id" = :component_id'
            ),
            {"component_id": str(component_id), "org_id": current_user.org_id},
        )
        if existing.first() is None:
            raise HTTPException(status_code=404, detail="Component not found")
        if "inventory_part_id" in values and values["inventory_part_id"] is not None:
            part = await session.execute(
                text(
                    'select "id" from "inventory_parts" where "id" = :part_id '
                    'and "orgId" = :org_id'
                ),
                {
                    "part_id": str(values["inventory_part_id"]),
                    "org_id": current_user.org_id,
                },
            )
            if part.first() is None:
                raise HTTPException(status_code=400, detail="Inventory part not found")
        values["component_id"] = str(component_id)
        result = await session.execute(
            text(
                'update "components" set '
                + ", ".join(assignments)
                + ' where "id" = :component_id returning "id", "vehicleId", '
                '"inventoryPartId", "name", "componentType", "componentSubtype", '
                '"brand", "partNumber", "serialNumber", "installationDate", '
                '"expectedLifeKm", "expectedLifeDays", "lastServicedOdometer", '
                '"alertThresholdKm", "alertThresholdDays", "notes", "status"'
            ),
            values,
        )
        row = result.mappings().one()
    return _component(row)


@router.delete("/components/{component_id}", response_model=ComponentSummary)
async def remove_component(
    component_id: UUID,
    current_user: TenantUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> ComponentSummary:
    if current_user.role not in {"SUPERADMIN", "FLEET_MANAGER"}:
        raise HTTPException(status_code=403, detail="Component removal access required")
    async with session.begin():
        result = await session.execute(
            text(
                'delete from "components" c using "vehicles" v where c."id" = :component_id '
                'and v."id" = c."vehicleId" and v."orgId" = :org_id returning '
                'c."id", c."vehicleId", c."inventoryPartId", c."name", c."componentType", '
                'c."componentSubtype", c."brand", c."partNumber", c."serialNumber", '
                'c."installationDate", c."expectedLifeKm", c."expectedLifeDays", '
                'c."lastServicedOdometer", c."alertThresholdKm", c."alertThresholdDays", '
                'c."notes", c."status"'
            ),
            {"component_id": str(component_id), "org_id": current_user.org_id},
        )
        row = result.mappings().first()
        if row is None:
            raise HTTPException(status_code=404, detail="Component not found")
    return _component(row)
