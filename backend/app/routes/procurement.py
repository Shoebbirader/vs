from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_db_session
from ..tenant import TenantUser, get_current_user

router = APIRouter(prefix="/api/v2", tags=["procurement"])


class PurchaseOrderSummary(BaseModel):
    id: UUID
    vendor_id: UUID
    vendor_name: str
    status: str
    total_cost: float
    supplier_invoice_number: str | None
    received_at: datetime | None
    closed_at: datetime | None


class PurchaseOrderCreate(BaseModel):
    vendor_id: UUID
    total_cost: float = Field(ge=0)
    supplier_invoice_number: str | None = Field(default=None, max_length=120)


@router.get("/purchase-orders", response_model=list[PurchaseOrderSummary])
async def list_purchase_orders(
    current_user: TenantUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> list[PurchaseOrderSummary]:
    result = await session.execute(
        text(
            'select po."id", po."vendorId", v."name" as "vendorName", '
            'po."status", po."totalCost", po."supplierInvoiceNumber", '
            'po."receivedAt", po."closedAt" from "purchase_orders" po '
            'join "vendors" v on v."id" = po."vendorId" and v."orgId" = po."orgId" '
            'where po."orgId" = :org_id order by po."createdAt" desc'
        ),
        {"org_id": current_user.org_id},
    )
    return [
        PurchaseOrderSummary(
            id=row["id"],
            vendor_id=row["vendorId"],
            vendor_name=row["vendorName"],
            status=row["status"],
            total_cost=float(row["totalCost"]),
            supplier_invoice_number=row["supplierInvoiceNumber"],
            received_at=row["receivedAt"],
            closed_at=row["closedAt"],
        )
        for row in result.mappings()
    ]


@router.post("/purchase-orders", response_model=PurchaseOrderSummary, status_code=201)
async def create_purchase_order(
    payload: PurchaseOrderCreate,
    current_user: TenantUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> PurchaseOrderSummary:
    if current_user.role not in {"SUPERADMIN", "INVENTORY_MANAGER"}:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Inventory manager access required",
        )
    async with session.begin():
        vendor = await session.execute(
            text(
                'select "id", "name" from "vendors" '
                'where "id" = :vendor_id and "orgId" = :org_id'
            ),
            {"vendor_id": str(payload.vendor_id), "org_id": current_user.org_id},
        )
        vendor_row = vendor.mappings().first()
        if vendor_row is None:
            raise HTTPException(status_code=404, detail="Vendor not found")
        result = await session.execute(
            text(
                'insert into "purchase_orders" '
                '("orgId", "vendorId", "status", "totalCost", '
                '"supplierInvoiceNumber", "createdById", "updatedById") '
                'values (:org_id, :vendor_id, :status, :total_cost, '
                ':invoice_number, :actor_id, :actor_id) returning '
                '"id", "vendorId", "status", "totalCost", '
                '"supplierInvoiceNumber", "receivedAt", "closedAt"'
            ),
            {
                "org_id": current_user.org_id,
                "vendor_id": str(payload.vendor_id),
                "status": "DRAFT",
                "total_cost": payload.total_cost,
                "invoice_number": payload.supplier_invoice_number,
                "actor_id": current_user.id,
            },
        )
        row = result.mappings().one()
    return PurchaseOrderSummary(
        id=row["id"],
        vendor_id=row["vendorId"],
        vendor_name=vendor_row["name"],
        status=row["status"],
        total_cost=float(row["totalCost"]),
        supplier_invoice_number=row["supplierInvoiceNumber"],
        received_at=row["receivedAt"],
        closed_at=row["closedAt"],
    )
