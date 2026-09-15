from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_db_session
from ..tenant import TenantUser, get_current_user

router = APIRouter(prefix="/api/v2", tags=["finance"])


class FinancialCreate(BaseModel):
    vehicle_id: UUID
    type: str = Field(pattern="^(REVENUE|EXPENSE)$")
    category: str = Field(min_length=2, max_length=100)
    amount: float = Field(ge=0)
    transaction_date: datetime
    tax_amount: float = Field(default=0, ge=0)
    gstin: str | None = Field(default=None, max_length=30)
    tax_category: str | None = Field(default=None, max_length=80)
    invoice_number: str | None = Field(default=None, max_length=120)
    vendor: str | None = Field(default=None, max_length=160)
    payment_method: str | None = Field(default=None, max_length=60)
    cost_center_type: str | None = Field(default=None, max_length=60)
    cost_center_id: UUID | None = None
    tds_amount: float = Field(default=0, ge=0)


class ReconcileRecord(BaseModel):
    reconciliation_ref: str = Field(min_length=1, max_length=160)


class Decision(BaseModel):
    reason: str = Field(min_length=3, max_length=500)


def _finance_role(user: TenantUser) -> None:
    if user.role not in {"SUPERADMIN", "ACCOUNTANT"}:
        raise HTTPException(status_code=403, detail="Finance access required")


def _record(row: dict[str, object]) -> dict[str, object]:
    return {
        "id": row["id"],
        "org_id": row["orgId"],
        "vehicle_id": row["vehicleId"],
        "type": row["type"],
        "category": row["category"],
        "amount": float(row["amount"]),
        "transaction_date": row["transactionDate"],
        "tax_amount": float(row["taxAmount"]),
        "gstin": row["gstin"],
        "tax_category": row["taxCategory"],
        "invoice_number": row["invoiceNumber"],
        "vendor": row["vendor"],
        "payment_method": row["paymentMethod"],
        "cost_center_type": row["costCenterType"],
        "cost_center_id": row["costCenterId"],
        "tds_amount": float(row["tdsAmount"]),
        "reconciled_at": row["reconciledAt"],
        "reconciliation_ref": row["reconciliationRef"],
        "approval_status": row["approvalStatus"],
        "approved_by_id": row["approvedById"],
        "approval_reason": row["approvalReason"],
        "reversal_of_id": row["reversalOfId"],
        "created_at": row["createdAt"],
    }


_RECORD_COLUMNS = (
    '"id", "orgId", "vehicleId", "type", "category", "amount", "transactionDate", '
    '"taxAmount", "gstin", "taxCategory", "invoiceNumber", "vendor", "paymentMethod", '
    '"costCenterType", "costCenterId", "tdsAmount", "reconciledAt", "reconciliationRef", '
    '"approvalStatus", "approvedById", "approvalReason", "reversalOfId", "createdAt"'
)


@router.get("/financials/vehicles", response_model=list[dict[str, object]])
async def financial_vehicles(
    current_user: TenantUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> list[dict[str, object]]:
    _finance_role(current_user)
    result = await session.execute(
        text(
            'select "id", "vin", "licensePlate", "make", "model", "currentOdometer" '
            'from "vehicles" where "orgId" = :org_id order by "licensePlate"'
        ),
        {"org_id": current_user.org_id},
    )
    return [dict(row) for row in result.mappings()]


@router.get("/financials", response_model=list[dict[str, object]])
async def list_financials(
    vehicle_id: UUID | None = None,
    record_type: str | None = Query(default=None, alias="type"),
    category: str | None = None,
    from_date: datetime | None = Query(default=None, alias="from"),
    to_date: datetime | None = Query(default=None, alias="to"),
    current_user: TenantUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> list[dict[str, object]]:
    _finance_role(current_user)
    clauses = ['"orgId" = :org_id']
    params: dict[str, object] = {"org_id": current_user.org_id}
    for key, clause, value in (
        ("vehicle_id", '"vehicleId" = :vehicle_id', vehicle_id),
        ("record_type", '"type" = :record_type', record_type),
        ("category", '"category" = :category', category),
        ("from_date", '"transactionDate" >= :from_date', from_date),
        ("to_date", '"transactionDate" <= :to_date', to_date),
    ):
        if value is not None:
            clauses.append(clause)
            params[key] = str(value) if isinstance(value, UUID) else value
    result = await session.execute(
        text(
            f'select {_RECORD_COLUMNS} from "financial_records" where '
            + " and ".join(clauses)
            + ' order by "transactionDate" desc'
        ),
        params,
    )
    return [_record(row) for row in result.mappings()]


@router.post("/financials", response_model=dict[str, object], status_code=201)
async def create_financial(
    payload: FinancialCreate,
    current_user: TenantUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> dict[str, object]:
    _finance_role(current_user)
    approval = (
        "PENDING_APPROVAL"
        if payload.type == "EXPENSE"
        and (payload.amount >= 100000 or "MANUAL" in payload.category.upper())
        else "APPROVED"
    )
    async with session.begin():
        vehicle = await session.execute(
            text('select "id" from "vehicles" where "id" = :vehicle_id and "orgId" = :org_id'),
            {"vehicle_id": str(payload.vehicle_id), "org_id": current_user.org_id},
        )
        if vehicle.first() is None:
            raise HTTPException(status_code=400, detail="Vehicle is outside this organization")
        result = await session.execute(
            text(
                'insert into "financial_records" ("orgId", "vehicleId", "type", "category", "amount", '
                '"transactionDate", "taxAmount", "gstin", "taxCategory", "invoiceNumber", "vendor", '
                '"paymentMethod", "costCenterType", "costCenterId", "tdsAmount", "approvalStatus") '
                'values (:org_id, :vehicle_id, :type, :category, :amount, :transaction_date, '
                ':tax_amount, :gstin, :tax_category, :invoice_number, :vendor, :payment_method, '
                ':cost_center_type, :cost_center_id, :tds_amount, :approval_status) returning '
                + _RECORD_COLUMNS
            ),
            {
                "org_id": current_user.org_id,
                **payload.model_dump(mode="json"),
                "vehicle_id": str(payload.vehicle_id),
                "transaction_date": payload.transaction_date,
                "approval_status": approval,
            },
        )
        row = result.mappings().one()
    return _record(row)


@router.get("/financials/metrics", response_model=dict[str, object])
async def financial_metrics(
    current_user: TenantUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> dict[str, object]:
    _finance_role(current_user)
    rows = await session.execute(
        text(
            'select v."id" as "vehicleId", v."licensePlate", v."make", v."model", '
            'coalesce(sum(case when f."type" = \'REVENUE\' then f."amount" else 0 end), 0) as revenue, '
            'coalesce(sum(case when f."type" = \'EXPENSE\' then f."amount" else 0 end), 0) as expenses '
            'from "vehicles" v left join "financial_records" f on f."vehicleId" = v."id" '
            'and f."orgId" = :org_id where v."orgId" = :org_id group by v."id", '
            'v."licensePlate", v."make", v."model" order by v."licensePlate"'
        ),
        {"org_id": current_user.org_id},
    )
    result_rows = []
    for row in rows.mappings():
        revenue = float(row["revenue"])
        expenses = float(row["expenses"])
        result_rows.append(
            {
                "vehicle_id": row["vehicleId"],
                "vehicle": row["licensePlate"] or f"{row['make']} {row['model']}",
                "revenue": revenue,
                "expenses": expenses,
                "profit": revenue - expenses,
                "distance_km": 0,
                "cpk": 0,
            }
        )
    total_expenses = sum(item["expenses"] for item in result_rows)
    return {
        "rows": result_rows,
        "totals": {
            "revenue": sum(item["revenue"] for item in result_rows),
            "expenses": total_expenses,
            "profit": sum(item["profit"] for item in result_rows),
            "cpk": 0,
        },
        "expense_breakdown": [],
    }


@router.get("/financials/reconcile", response_model=dict[str, object])
async def reconcile_financials(
    current_user: TenantUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> dict[str, object]:
    _finance_role(current_user)
    result = await session.execute(
        text(
            'select v."id" as "vehicleId", v."licensePlate", '
            'coalesce((select sum("amount") from "fuel_logs" where "vehicleId" = v."id" '
            'and "orgId" = :org_id), 0) as "fuelLogged", '
            'coalesce((select sum("amount") from "financial_records" where "vehicleId" = v."id" '
            'and "orgId" = :org_id and "type" = \'EXPENSE\' and "category" = \'FUEL\'), 0) as "ledgerFuel" '
            'from "vehicles" v where v."orgId" = :org_id order by v."licensePlate"'
        ),
        {"org_id": current_user.org_id},
    )
    rows = []
    for row in result.mappings():
        logged = float(row["fuelLogged"])
        ledger = float(row["ledgerFuel"])
        difference = round(logged - ledger, 2)
        rows.append(
            {
                "vehicle_id": row["vehicleId"],
                "vehicle": row["licensePlate"],
                "fuel_logged": logged,
                "ledger_fuel": ledger,
                "difference": difference,
                "status": "MATCHED" if abs(difference) < 0.01 else "MISMATCH",
            }
        )
    return {"rows": rows, "mismatches": [row for row in rows if row["status"] == "MISMATCH"]}


@router.get("/reports/maintenance-performance", response_model=dict[str, object])
async def maintenance_performance(
    from_date: datetime | None = Query(default=None, alias="from"),
    to_date: datetime | None = Query(default=None, alias="to"),
    current_user: TenantUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> dict[str, object]:
    if current_user.role not in {"SUPERADMIN", "FLEET_MANAGER", "ACCOUNTANT"}:
        raise HTTPException(status_code=403, detail="Maintenance reporting access required")
    end = to_date or datetime.now(timezone.utc)
    start = from_date or end.replace(hour=0, minute=0, second=0, microsecond=0)
    if start > end:
        raise HTTPException(status_code=400, detail="Report start date must be before end date")
    result = await session.execute(
        text(
            'select "id", "vehicleId", "title", "status", "createdAt", "startedAt", "completedAt" '
            'from "work_orders" where "orgId" = :org_id and "createdAt" between :start_date and :end_date'
        ),
        {"org_id": current_user.org_id, "start_date": start, "end_date": end},
    )
    orders = list(result.mappings())
    completed = [row for row in orders if row["completedAt"]]
    durations = [
        max(0, (row["completedAt"] - (row["startedAt"] or row["createdAt"])).total_seconds() / 3600)
        for row in completed
    ]
    title_counts: dict[str, int] = {}
    for row in orders:
        title_counts[row["title"].strip().lower()] = title_counts.get(row["title"].strip().lower(), 0) + 1
    repeats = [{"title": title, "count": count} for title, count in title_counts.items() if count > 1]
    return {
        "from": start,
        "to": end,
        "total_work_orders": len(orders),
        "completed_work_orders": len(completed),
        "open_work_orders": sum(row["status"] not in {"COMPLETED", "CANCELLED"} for row in orders),
        "turnaround_hours": round(sum(durations) / len(durations), 2) if durations else 0,
        "downtime_hours": 0,
        "repeat_repairs": sorted(repeats, key=lambda row: row["count"], reverse=True),
        "failure_patterns": sorted(repeats, key=lambda row: row["count"], reverse=True)[:10],
        "vehicle_repair_counts": [],
    }


@router.get("/financials/approval-queue", response_model=list[dict[str, object]])
async def approval_queue(
    current_user: TenantUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> list[dict[str, object]]:
    if current_user.role != "SUPERADMIN":
        raise HTTPException(status_code=403, detail="Superadmin access required")
    result = await session.execute(
        text(
            f'select {_RECORD_COLUMNS} from "financial_records" where "orgId" = :org_id '
            'and "approvalStatus" = \'PENDING_APPROVAL\' order by "transactionDate"'
        ),
        {"org_id": current_user.org_id},
    )
    return [_record(row) for row in result.mappings()]


@router.patch("/financials/{record_id}/reconcile", response_model=dict[str, object])
async def reconcile_record(
    record_id: UUID,
    payload: ReconcileRecord,
    current_user: TenantUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> dict[str, object]:
    _finance_role(current_user)
    async with session.begin():
        result = await session.execute(
            text(
                f'update "financial_records" set "reconciledAt" = now(), '
                '"reconciliationRef" = :reference where "id" = :id and "orgId" = :org_id '
                f'returning {_RECORD_COLUMNS}'
            ),
            {"id": str(record_id), "org_id": current_user.org_id, "reference": payload.reconciliation_ref},
        )
        row = result.mappings().first()
        if row is None:
            raise HTTPException(status_code=404, detail="Financial record not found")
    return _record(row)


@router.patch("/financials/{record_id}/approve", response_model=dict[str, object])
async def approve_record(
    record_id: UUID,
    payload: Decision,
    current_user: TenantUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> dict[str, object]:
    if current_user.role != "SUPERADMIN":
        raise HTTPException(status_code=403, detail="Superadmin access required")
    async with session.begin():
        result = await session.execute(
            text(
                f'update "financial_records" set "approvalStatus" = \'APPROVED\', '
                '"approvedById" = :actor_id, "approvalReason" = :reason where "id" = :id '
                'and "orgId" = :org_id and "approvalStatus" = \'PENDING_APPROVAL\' '
                f'returning {_RECORD_COLUMNS}'
            ),
            {
                "id": str(record_id),
                "org_id": current_user.org_id,
                "actor_id": current_user.id,
                "reason": payload.reason,
            },
        )
        row = result.mappings().first()
        if row is None:
            raise HTTPException(status_code=409, detail="Record is not pending approval or not found")
    return _record(row)


@router.post("/financials/{record_id}/reverse", response_model=dict[str, object], status_code=201)
async def reverse_record(
    record_id: UUID,
    payload: Decision,
    current_user: TenantUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> dict[str, object]:
    _finance_role(current_user)
    async with session.begin():
        existing_result = await session.execute(
            text(
                f'select {_RECORD_COLUMNS} from "financial_records" where "id" = :id '
                'and "orgId" = :org_id for update'
            ),
            {"id": str(record_id), "org_id": current_user.org_id},
        )
        existing = existing_result.mappings().first()
        if existing is None:
            raise HTTPException(status_code=404, detail="Financial record not found")
        prior = await session.execute(
            text('select "id" from "financial_records" where "orgId" = :org_id and "reversalOfId" = :id'),
            {"org_id": current_user.org_id, "id": str(record_id)},
        )
        if prior.first() is not None:
            raise HTTPException(status_code=409, detail="This financial record has already been reversed")
        result = await session.execute(
            text(
                'insert into "financial_records" ("orgId", "vehicleId", "type", "category", "amount", '
                '"transactionDate", "approvalStatus", "approvalReason", "reversalOfId") values '
                '(:org_id, :vehicle_id, :type, :category, :amount, now(), :approval_status, '
                ':reason, :reversal_of_id) returning ' + _RECORD_COLUMNS
            ),
            {
                "org_id": current_user.org_id,
                "vehicle_id": existing["vehicleId"],
                "type": "REVENUE" if existing["type"] == "EXPENSE" else "EXPENSE",
                "category": f"REVERSAL:{existing['category']}",
                "amount": existing["amount"],
                "approval_status": "APPROVED" if existing["approvalStatus"] == "APPROVED" else "PENDING_APPROVAL",
                "reason": payload.reason,
                "reversal_of_id": str(record_id),
            },
        )
        row = result.mappings().one()
    return _record(row)
