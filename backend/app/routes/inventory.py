import csv
import io
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_db_session
from ..tenant import TenantUser, get_current_user

router = APIRouter(prefix="/api/v2", tags=["inventory"])


class PartSummary(BaseModel):
    id: UUID
    sku: str
    name: str
    bin_location: str | None
    quantity_on_hand: int
    min_reorder_level: int
    unit_cost: float


class PartCreate(BaseModel):
    sku: str = Field(min_length=1, max_length=80)
    name: str = Field(min_length=1, max_length=200)
    bin_location: str | None = Field(default=None, max_length=80)
    quantity_on_hand: int = Field(default=0, ge=0)
    min_reorder_level: int = Field(default=0, ge=0)
    unit_cost: float = Field(default=0, ge=0)


class PartReceive(BaseModel):
    quantity: int = Field(gt=0)
    unit_cost: float | None = Field(default=None, ge=0)
    reason: str = Field(min_length=3, max_length=300)


class PartIssue(BaseModel):
    quantity: int = Field(gt=0)
    reason: str = Field(min_length=3, max_length=300)
    work_order_id: UUID | None = None


class PartTransfer(BaseModel):
    to_bin_location: str = Field(min_length=1, max_length=80)
    reason: str = Field(min_length=3, max_length=300)


class PartAdjustment(BaseModel):
    expected_quantity_on_hand: int = Field(ge=0)
    delta: int
    reason: str = Field(min_length=3, max_length=300)


class InventoryImport(BaseModel):
    csv: str = Field(max_length=1_000_000)


class PartReservation(BaseModel):
    work_order_id: UUID
    quantity: int = Field(gt=0)
    reason: str = Field(default="Reserved for work order", min_length=3, max_length=300)


class ReservationReturn(BaseModel):
    reservation_id: UUID
    quantity: int = Field(gt=0)
    reason: str = Field(default="Returned unused reserved stock", min_length=3, max_length=300)


def _part(row: dict[str, object]) -> PartSummary:
    return PartSummary(
        id=row["id"],
        sku=row["sku"],
        name=row["name"],
        bin_location=row["binLocation"],
        quantity_on_hand=row["quantityOnHand"],
        min_reorder_level=row["minReorderLevel"],
        unit_cost=float(row["unitCost"]),
    )


@router.get("/inventory/parts", response_model=list[PartSummary])
async def list_parts(
    current_user: TenantUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> list[PartSummary]:
    result = await session.execute(
        text(
            'select "id", "sku", "name", "binLocation", "quantityOnHand", '
            '"minReorderLevel", "unitCost" from "inventory_parts" '
            'where "orgId" = :org_id order by "name"'
        ),
        {"org_id": current_user.org_id},
    )
    return [_part(row) for row in result.mappings()]


@router.post("/inventory/parts", response_model=PartSummary, status_code=201)
async def create_part(
    payload: PartCreate,
    current_user: TenantUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> PartSummary:
    if current_user.role not in {"SUPERADMIN", "INVENTORY_MANAGER"}:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Inventory manager access required",
        )
    async with session.begin():
        result = await session.execute(
            text(
                'insert into "inventory_parts" '
                '("orgId", "sku", "name", "binLocation", "quantityOnHand", '
                '"minReorderLevel", "unitCost") values (:org_id, :sku, :name, '
                ':bin_location, :quantity_on_hand, :min_reorder_level, :unit_cost) '
                'returning "id", "sku", "name", "binLocation", "quantityOnHand", '
                '"minReorderLevel", "unitCost"'
            ),
            {
                "org_id": current_user.org_id,
                "sku": payload.sku.strip().upper(),
                "name": payload.name.strip(),
                "bin_location": payload.bin_location.strip()
                if payload.bin_location
                else None,
                "quantity_on_hand": payload.quantity_on_hand,
                "min_reorder_level": payload.min_reorder_level,
                "unit_cost": payload.unit_cost,
            },
        )
        row = result.mappings().one()
    return _part(row)


async def _part_for_org(
    part_id: UUID, current_user: TenantUser, session: AsyncSession
) -> dict[str, object]:
    result = await session.execute(
        text(
            'select "id", "sku", "name", "binLocation", "quantityOnHand", '
            '"minReorderLevel", "unitCost" from "inventory_parts" '
            'where "id" = :part_id and "orgId" = :org_id for update'
        ),
        {"part_id": str(part_id), "org_id": current_user.org_id},
    )
    row = result.mappings().first()
    if row is None:
        raise HTTPException(status_code=404, detail="Inventory part not found")
    return dict(row)


def _require_inventory_role(current_user: TenantUser) -> None:
    if current_user.role not in {"SUPERADMIN", "INVENTORY_MANAGER"}:
        raise HTTPException(status_code=403, detail="Inventory manager access required")


@router.post("/inventory/parts/{part_id}/receive", response_model=PartSummary)
async def receive_part(
    part_id: UUID,
    payload: PartReceive,
    current_user: TenantUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> PartSummary:
    _require_inventory_role(current_user)
    async with session.begin():
        part = await _part_for_org(part_id, current_user, session)
        result = await session.execute(
            text(
                'update "inventory_parts" set "quantityOnHand" = "quantityOnHand" + :quantity, '
                '"unitCost" = coalesce(:unit_cost, "unitCost") where "id" = :part_id '
                'and "orgId" = :org_id returning "id", "sku", "name", "binLocation", '
                '"quantityOnHand", "minReorderLevel", "unitCost"'
            ),
            {
                "quantity": payload.quantity,
                "unit_cost": payload.unit_cost,
                "part_id": str(part_id),
                "org_id": current_user.org_id,
            },
        )
        row = result.mappings().one()
        await session.execute(
            text(
                'insert into "inventory_movements" ("orgId", "partId", "actorId", '
                '"movementType", "quantity", "unitCost", "reason") values '
                '(:org_id, :part_id, :actor_id, \'RECEIPT\', :quantity, :unit_cost, :reason)'
            ),
            {
                "org_id": current_user.org_id,
                "part_id": str(part_id),
                "actor_id": current_user.id,
                "quantity": payload.quantity,
                "unit_cost": payload.unit_cost if payload.unit_cost is not None else part["unitCost"],
                "reason": payload.reason,
            },
        )
    return _part(row)


@router.post("/inventory/parts/{part_id}/issue", response_model=PartSummary)
async def issue_part(
    part_id: UUID,
    payload: PartIssue,
    current_user: TenantUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> PartSummary:
    if current_user.role not in {
        "SUPERADMIN",
        "INVENTORY_MANAGER",
        "MECHANIC",
        "TECHNICIAN",
    }:
        raise HTTPException(status_code=403, detail="Inventory issue access required")
    if current_user.role in {"MECHANIC", "TECHNICIAN"} and payload.work_order_id is None:
        raise HTTPException(status_code=400, detail="A work order is required for mechanics and technicians")
    async with session.begin():
        await _part_for_org(part_id, current_user, session)
        if payload.work_order_id:
            order_query = (
                'select "id" from "work_orders" where "id" = :work_order_id '
                'and "orgId" = :org_id and "status" not in (\'COMPLETED\', \'CANCELLED\')'
            )
            params: dict[str, object] = {
                "work_order_id": str(payload.work_order_id),
                "org_id": current_user.org_id,
            }
            if current_user.role in {"MECHANIC", "TECHNICIAN"}:
                order_query += ' and "assignedMechanicId" = :actor_id'
                params["actor_id"] = current_user.id
            order = await session.execute(text(order_query), params)
            if order.first() is None:
                raise HTTPException(status_code=400, detail="Work order is outside the active maintenance scope")
        result = await session.execute(
            text(
                'update "inventory_parts" set "quantityOnHand" = "quantityOnHand" - :quantity '
                'where "id" = :part_id and "orgId" = :org_id and "quantityOnHand" >= :quantity '
                'returning "id", "sku", "name", "binLocation", "quantityOnHand", '
                '"minReorderLevel", "unitCost"'
            ),
            {
                "quantity": payload.quantity,
                "part_id": str(part_id),
                "org_id": current_user.org_id,
            },
        )
        row = result.mappings().first()
        if row is None:
            raise HTTPException(status_code=409, detail="Insufficient inventory or concurrent balance change")
        await session.execute(
            text(
                'insert into "inventory_movements" ("orgId", "partId", "workOrderId", "actorId", '
                '"movementType", "quantity", "unitCost", "reason") values '
                '(:org_id, :part_id, :work_order_id, :actor_id, \'ISSUE\', :quantity, '
                ':unit_cost, :reason)'
            ),
            {
                "org_id": current_user.org_id,
                "part_id": str(part_id),
                "work_order_id": str(payload.work_order_id) if payload.work_order_id else None,
                "actor_id": current_user.id,
                "quantity": -payload.quantity,
                "unit_cost": row["unitCost"],
                "reason": payload.reason,
            },
        )
    return _part(row)


@router.post("/inventory/parts/{part_id}/transfer", response_model=PartSummary)
async def transfer_part(
    part_id: UUID,
    payload: PartTransfer,
    current_user: TenantUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> PartSummary:
    _require_inventory_role(current_user)
    async with session.begin():
        part = await _part_for_org(part_id, current_user, session)
        result = await session.execute(
            text(
                'update "inventory_parts" set "binLocation" = :bin_location '
                'where "id" = :part_id and "orgId" = :org_id returning '
                '"id", "sku", "name", "binLocation", "quantityOnHand", "minReorderLevel", "unitCost"'
            ),
            {
                "bin_location": payload.to_bin_location.strip(),
                "part_id": str(part_id),
                "org_id": current_user.org_id,
            },
        )
        row = result.mappings().one()
        await session.execute(
            text(
                'insert into "inventory_movements" ("orgId", "partId", "actorId", '
                '"movementType", "quantity", "unitCost", "reason") values '
                '(:org_id, :part_id, :actor_id, \'TRANSFER\', 0, :unit_cost, :reason)'
            ),
            {
                "org_id": current_user.org_id,
                "part_id": str(part_id),
                "actor_id": current_user.id,
                "unit_cost": part["unitCost"],
                "reason": f'{part["binLocation"] or "Unassigned"} → {payload.to_bin_location}: {payload.reason}',
            },
        )
    return _part(row)


@router.post("/inventory/parts/{part_id}/adjust", response_model=PartSummary)
async def adjust_part(
    part_id: UUID,
    payload: PartAdjustment,
    current_user: TenantUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> PartSummary:
    _require_inventory_role(current_user)
    next_quantity = payload.expected_quantity_on_hand + payload.delta
    if next_quantity < 0:
        raise HTTPException(status_code=400, detail="Inventory cannot become negative")
    async with session.begin():
        part = await _part_for_org(part_id, current_user, session)
        result = await session.execute(
            text(
                'update "inventory_parts" set "quantityOnHand" = :next_quantity '
                'where "id" = :part_id and "orgId" = :org_id '
                'and "quantityOnHand" = :expected_quantity returning "id", "sku", "name", '
                '"binLocation", "quantityOnHand", "minReorderLevel", "unitCost"'
            ),
            {
                "next_quantity": next_quantity,
                "part_id": str(part_id),
                "org_id": current_user.org_id,
                "expected_quantity": payload.expected_quantity_on_hand,
            },
        )
        row = result.mappings().first()
        if row is None:
            raise HTTPException(status_code=409, detail="Inventory changed since it was loaded")
        await session.execute(
            text(
                'insert into "inventory_movements" ("orgId", "partId", "actorId", '
                '"movementType", "quantity", "unitCost", "reason") values '
                '(:org_id, :part_id, :actor_id, \'ADJUSTMENT\', :quantity, :unit_cost, :reason)'
            ),
            {
                "org_id": current_user.org_id,
                "part_id": str(part_id),
                "actor_id": current_user.id,
                "quantity": payload.delta,
                "unit_cost": part["unitCost"],
                "reason": payload.reason,
            },
        )
    return _part(row)


@router.post("/inventory/import", response_model=dict[str, int])
async def import_inventory(
    payload: InventoryImport,
    current_user: TenantUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> dict[str, int]:
    _require_inventory_role(current_user)
    reader = csv.DictReader(io.StringIO(payload.csv))
    required = {"sku", "name", "quantityOnHand", "minReorderLevel", "unitCost"}
    if not reader.fieldnames or not required.issubset(set(reader.fieldnames)):
        raise HTTPException(status_code=400, detail="CSV must include sku, name, quantityOnHand, minReorderLevel, and unitCost")
    rows = list(reader)
    async with session.begin():
        existing = await session.execute(
            text('select "sku" from "inventory_parts" where "orgId" = :org_id'),
            {"org_id": current_user.org_id},
        )
        seen = {str(row["sku"]).upper() for row in existing.mappings()}
        candidates: list[dict[str, object]] = []
        for row in rows:
            sku = str(row.get("sku", "")).strip().upper()
            name = str(row.get("name", "")).strip()
            if not sku or not name:
                raise HTTPException(status_code=400, detail="CSV rows require sku and name")
            if sku in seen:
                raise HTTPException(status_code=409, detail=f"Duplicate SKU: {sku}")
            try:
                quantity = int(row["quantityOnHand"])
                minimum = int(row["minReorderLevel"])
                unit_cost = float(row["unitCost"])
            except (TypeError, ValueError) as error:
                raise HTTPException(status_code=400, detail="CSV contains invalid numeric values") from error
            if quantity < 0 or minimum < 0 or unit_cost < 0:
                raise HTTPException(status_code=400, detail="CSV numeric values cannot be negative")
            seen.add(sku)
            candidates.append(
                {
                    "sku": sku,
                    "name": name,
                    "bin_location": str(row.get("binLocation", "")).strip() or None,
                    "quantity": quantity,
                    "minimum": minimum,
                    "unit_cost": unit_cost,
                }
            )
        for candidate in candidates:
            await session.execute(
                text(
                    'insert into "inventory_parts" ("orgId", "sku", "name", "binLocation", '
                    '"quantityOnHand", "minReorderLevel", "unitCost") values '
                    '(:org_id, :sku, :name, :bin_location, :quantity, :minimum, :unit_cost)'
                ),
                {"org_id": current_user.org_id, **candidate},
            )
    return {"created": len(rows)}


@router.post("/inventory/parts/{part_id}/reserve")
async def reserve_part(
    part_id: UUID,
    payload: PartReservation,
    current_user: TenantUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> dict[str, object]:
    if current_user.role not in {
        "SUPERADMIN",
        "FLEET_MANAGER",
        "INVENTORY_MANAGER",
        "MECHANIC",
        "TECHNICIAN",
    }:
        raise HTTPException(status_code=403, detail="Inventory reservation access required")
    reservation_id = uuid4()
    async with session.begin():
        part = await _part_for_org(part_id, current_user, session)
        order_query = (
            'select "id" from "work_orders" where "id" = :work_order_id '
            'and "orgId" = :org_id'
        )
        order_params: dict[str, object] = {
            "work_order_id": str(payload.work_order_id),
            "org_id": current_user.org_id,
        }
        if current_user.role in {"MECHANIC", "TECHNICIAN"}:
            order_query += ' and "assignedMechanicId" = :actor_id'
            order_params["actor_id"] = current_user.id
        order = await session.execute(text(order_query), order_params)
        if order.first() is None:
            raise HTTPException(status_code=404, detail="Work order is outside your role scope")
        totals = await session.execute(
            text(
                'select coalesce(sum(case when "movementType" = \'RESERVATION\' then "quantity" '
                'when "movementType" = \'RETURN\' then -"quantity" else 0 end), 0) as "reserved" '
                'from "inventory_movements" where "orgId" = :org_id and "partId" = :part_id'
            ),
            {
                "org_id": current_user.org_id,
                "part_id": str(part_id),
            },
        )
        reserved = int(totals.scalar_one())
        if int(part["quantityOnHand"]) - reserved < payload.quantity:
            raise HTTPException(status_code=400, detail="Insufficient available stock after existing reservations")
        await session.execute(
            text(
                'insert into "inventory_movements" ("orgId", "partId", "workOrderId", "actorId", '
                '"movementType", "quantity", "unitCost", "reason") values '
                '(:org_id, :part_id, :work_order_id, :actor_id, \'RESERVATION\', :quantity, '
                ':unit_cost, :reason)'
            ),
            {
                "org_id": current_user.org_id,
                "part_id": str(part_id),
                "work_order_id": str(payload.work_order_id),
                "actor_id": current_user.id,
                "quantity": payload.quantity,
                "unit_cost": part["unitCost"],
                "reason": f"reservation:{reservation_id}|{payload.reason}",
            },
        )
    return {
        "reservationId": reservation_id,
        "workOrderId": payload.work_order_id,
        "partId": part_id,
        "quantity": payload.quantity,
    }


@router.post("/inventory/reservations/return")
async def return_reserved_part(
    payload: ReservationReturn,
    current_user: TenantUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> dict[str, object]:
    if current_user.role not in {
        "SUPERADMIN",
        "FLEET_MANAGER",
        "INVENTORY_MANAGER",
        "MECHANIC",
        "TECHNICIAN",
    }:
        raise HTTPException(status_code=403, detail="Inventory reservation access required")
    marker = f"reservation:{payload.reservation_id}|"
    async with session.begin():
        reservation = await session.execute(
            text(
                'select "partId", "workOrderId", "quantity", "unitCost" from "inventory_movements" '
                'where "orgId" = :org_id and "movementType" = \'RESERVATION\' '
                'and "reason" like :marker limit 1'
            ),
            {"org_id": current_user.org_id, "marker": marker + "%"},
        )
        row = reservation.mappings().first()
        if row is None:
            raise HTTPException(status_code=404, detail="Active part reservation not found")
        returned = await session.execute(
            text(
                'select coalesce(sum("quantity"), 0) from "inventory_movements" '
                'where "orgId" = :org_id and "movementType" = \'RETURN\' '
                'and "reason" like :marker'
            ),
            {"org_id": current_user.org_id, "marker": f"return:{payload.reservation_id}|%"},
        )
        returned_quantity = int(returned.scalar_one())
        remaining = int(row["quantity"]) - returned_quantity
        if payload.quantity > remaining:
            raise HTTPException(status_code=400, detail="Return quantity exceeds the remaining reservation")
        await session.execute(
            text(
                'insert into "inventory_movements" ("orgId", "partId", "workOrderId", "actorId", '
                '"movementType", "quantity", "unitCost", "reason") values '
                '(:org_id, :part_id, :work_order_id, :actor_id, \'RETURN\', :quantity, '
                ':unit_cost, :reason)'
            ),
            {
                "org_id": current_user.org_id,
                "part_id": row["partId"],
                "work_order_id": row["workOrderId"],
                "actor_id": current_user.id,
                "quantity": payload.quantity,
                "unit_cost": row["unitCost"],
                "reason": f"return:{payload.reservation_id}|{payload.reason}",
            },
        )
    return {
        "reservationId": payload.reservation_id,
        "partId": row["partId"],
        "workOrderId": row["workOrderId"],
        "quantityReturned": payload.quantity,
        "remainingQuantity": remaining - payload.quantity,
    }
