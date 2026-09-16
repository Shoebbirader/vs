from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_db_session
from ..tenant import TenantUser, get_current_user

router = APIRouter(prefix="/api/v2", tags=["vendors"])


class VendorSummary(BaseModel):
    id: UUID
    name: str
    contact_person: str | None
    phone: str
    email: str | None


class VendorCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    contact_person: str | None = Field(default=None, max_length=200)
    phone: str = Field(min_length=1, max_length=40)
    email: str | None = Field(default=None, max_length=320)


def _vendor(row: dict[str, object]) -> VendorSummary:
    return VendorSummary(
        id=row["id"],
        name=row["name"],
        contact_person=row["contactPerson"],
        phone=row["phone"],
        email=row["email"],
    )


@router.get("/vendors", response_model=list[VendorSummary])
async def list_vendors(
    current_user: TenantUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> list[VendorSummary]:
    result = await session.execute(
        text(
            'select "id", "name", "contactPerson", "phone", "email" '
            'from "vendors" where "orgId" = :org_id order by "name"'
        ),
        {"org_id": current_user.org_id},
    )
    return [_vendor(row) for row in result.mappings()]


@router.post("/vendors", response_model=VendorSummary, status_code=201)
async def create_vendor(
    payload: VendorCreate,
    current_user: TenantUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> VendorSummary:
    if current_user.role not in {"SUPERADMIN", "INVENTORY_MANAGER", "FLEET_MANAGER"}:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Vendor management access required",
        )
    async with session.begin():
        result = await session.execute(
            text(
                'insert into "vendors" '
                '("orgId", "name", "contactPerson", "phone", "email") '
                'values (:org_id, :name, :contact_person, :phone, :email) '
                'returning "id", "name", "contactPerson", "phone", "email"'
            ),
            {
                "org_id": current_user.org_id,
                "name": payload.name.strip(),
                "contact_person": payload.contact_person.strip()
                if payload.contact_person
                else None,
                "phone": payload.phone.strip(),
                "email": payload.email.strip().lower() if payload.email else None,
            },
        )
        row = result.mappings().one()
    return _vendor(row)
