from uuid import UUID

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
