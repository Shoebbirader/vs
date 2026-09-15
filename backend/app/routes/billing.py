import base64
import hashlib
import hmac
import json
from datetime import datetime, timedelta, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_db_session
from ..config import get_settings
from ..tenant import TenantUser, get_current_user

router = APIRouter(prefix="/api/v2", tags=["billing"])

PLANS = {
    "STARTER": {
        "id": "STARTER",
        "name": "Starter",
        "platform_fee_paise": 299900,
        "included_vehicles": 3,
        "overage_vehicle_fee_paise": 50000,
        "max_users": 999999,
        "min_vehicles": 1,
        "max_vehicles": 10,
        "description": "For small operators and pilots.",
    },
    "GROWTH": {
        "id": "GROWTH",
        "name": "Growth",
        "platform_fee_paise": 999900,
        "included_vehicles": 15,
        "overage_vehicle_fee_paise": 45000,
        "max_users": 999999,
        "min_vehicles": 11,
        "max_vehicles": 49,
        "description": "For growing regional fleets.",
    },
    "SCALE": {
        "id": "SCALE",
        "name": "Scale",
        "platform_fee_paise": 2499900,
        "included_vehicles": 50,
        "overage_vehicle_fee_paise": 35000,
        "max_users": 999999,
        "min_vehicles": 50,
        "max_vehicles": 99,
        "description": "For multi-depot operators.",
    },
    "ENTERPRISE": {
        "id": "ENTERPRISE",
        "name": "Enterprise",
        "platform_fee_paise": 0,
        "included_vehicles": 100,
        "overage_vehicle_fee_paise": 30000,
        "max_users": 999999,
        "min_vehicles": 100,
        "max_vehicles": 999999,
        "description": "For large fleets with custom service and integrations.",
    },
}


def _admin(user: TenantUser) -> None:
    if user.role != "SUPERADMIN":
        raise HTTPException(status_code=403, detail="Superadmin access required")


def _bill(plan: dict[str, object], active_vehicles: int) -> dict[str, int]:
    included = int(plan["included_vehicles"])
    overage = max(0, active_vehicles - included)
    overage_paise = overage * int(plan["overage_vehicle_fee_paise"])
    subtotal = int(plan["platform_fee_paise"]) + overage_paise
    return {
        "billable_vehicles": active_vehicles,
        "overage_vehicles": overage,
        "platform_fee_paise": int(plan["platform_fee_paise"]),
        "overage_paise": overage_paise,
        "usage_addons_paise": 0,
        "credits_paise": 0,
        "subtotal_paise": subtotal,
    }


@router.get("/billing/plans", response_model=list[dict[str, object]])
async def billing_plans() -> list[dict[str, object]]:
    return [
        {
            **plan,
            "platform_fee_inr": plan["platform_fee_paise"] / 100,
            "overage_vehicle_fee_inr": plan["overage_vehicle_fee_paise"] / 100,
        }
        for plan in PLANS.values()
    ]


@router.get("/billing/status", response_model=dict[str, object])
async def billing_status(
    current_user: TenantUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> dict[str, object]:
    _admin(current_user)
    org_result = await session.execute(
        text(
            'select "subscriptionTier", "trialEndsAt", "billingStatus", "paymentFailedAt", '
            '"maxVehicles", "maxUsers" from "organizations" where "id" = :org_id'
        ),
        {"org_id": current_user.org_id},
    )
    org = org_result.mappings().first()
    if org is None:
        raise HTTPException(status_code=404, detail="Organization not found")
    active = int(
        (
            await session.execute(
                text('select count(*) from "vehicles" where "orgId" = :org_id'),
                {"org_id": current_user.org_id},
            )
        ).scalar_one()
    )
    trial = org["subscriptionTier"] == "TRIAL_FREE"
    plan = PLANS["STARTER" if trial else str(org["subscriptionTier"]).upper()]
    bill = _bill(plan, active)
    now = datetime.now(timezone.utc)
    if org["paymentFailedAt"]:
        elapsed = (now - org["paymentFailedAt"]).days
        lifecycle = "PAYMENT_GRACE" if elapsed <= 7 else "READ_ONLY_GRACE" if elapsed <= 21 else "SUSPENDED"
    elif trial:
        lifecycle = "TRIAL" if org["trialEndsAt"] >= now else "ACTIVE"
    else:
        lifecycle = org["billingStatus"] or "ACTIVE"
    return {
        "tier": org["subscriptionTier"],
        "plan_name": plan["name"],
        "plan_description": plan["description"],
        "is_trial": trial,
        "trial_ends_at": org["trialEndsAt"],
        "days_remaining": max(0, (org["trialEndsAt"] - now).days) if trial else 0,
        "max_vehicles": plan["max_vehicles"],
        "max_users": plan["max_users"],
        "active_vehicles": active,
        "currency": "INR",
        "billing_ready": False,
        "write_locked": lifecycle == "SUSPENDED",
        **bill,
        "lifecycle": lifecycle,
    }


@router.get("/billing/invoices", response_model=list[dict[str, object]])
async def billing_invoices(
    current_user: TenantUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> list[dict[str, object]]:
    _admin(current_user)
    result = await session.execute(
        text(
            'select * from "billing_invoices" where "orgId" = :org_id '
            'order by "createdAt" desc limit 12'
        ),
        {"org_id": current_user.org_id},
    )
    return [dict(row) for row in result.mappings()]


@router.get("/billing/payments", response_model=list[dict[str, object]])
async def billing_payments(
    current_user: TenantUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> list[dict[str, object]]:
    _admin(current_user)
    result = await session.execute(
        text(
            'select * from "billing_payments" where "orgId" = :org_id '
            'order by "createdAt" desc limit 20'
        ),
        {"org_id": current_user.org_id},
    )
    return [dict(row) for row in result.mappings()]


@router.get("/billing-test/plan-eligibility", response_model=dict[str, object])
async def plan_eligibility(
    plan: str,
    current_user: TenantUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> dict[str, object]:
    _admin(current_user)
    normalized = plan.upper()
    if normalized not in PLANS:
        raise HTTPException(status_code=400, detail="Unknown billing plan")
    active = int(
        (
            await session.execute(
                text('select count(*) from "vehicles" where "orgId" = :org_id'),
                {"org_id": current_user.org_id},
            )
        ).scalar_one()
    )
    config = PLANS[normalized]
    eligible = int(config["min_vehicles"]) <= active <= int(config["max_vehicles"])
    return {
        "plan": normalized,
        "active_vehicles": active,
        "eligible": eligible,
        "reason": None if eligible else f"Plan requires {config['min_vehicles']}-{config['max_vehicles']} vehicles.",
        "min_vehicles": config["min_vehicles"],
        "max_vehicles": config["max_vehicles"],
    }


@router.post("/billing/invoices/generate", response_model=dict[str, object])
async def generate_invoice(
    current_user: TenantUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> dict[str, object]:
    _admin(current_user)
    now = datetime.now(timezone.utc)
    period_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    if period_start.month == 12:
        next_month = period_start.replace(year=period_start.year + 1, month=1)
    else:
        next_month = period_start.replace(month=period_start.month + 1)
    period_end = next_month.replace(microsecond=0) - timedelta(microseconds=1)
    result = await session.execute(
        text(
            'select "subscriptionTier" from "organizations" where "id" = :org_id'
        ),
        {"org_id": current_user.org_id},
    )
    organization = result.mappings().first()
    if organization is None:
        raise HTTPException(status_code=404, detail="Organization not found")
    active = int(
        (
            await session.execute(
                text('select count(*) from "vehicles" where "orgId" = :org_id'),
                {"org_id": current_user.org_id},
            )
        ).scalar_one()
    )
    plan = PLANS["STARTER" if organization["subscriptionTier"] == "TRIAL_FREE" else str(organization["subscriptionTier"]).upper()]
    bill = _bill(plan, active)
    await session.commit()
    async with session.begin():
        existing = (
            await session.execute(
                text(
                    'select * from "billing_invoices" where "orgId" = :org_id '
                    'and "billingPeriodStart" = :period_start'
                ),
                {"org_id": current_user.org_id, "period_start": period_start},
            )
        ).mappings().first()
        if existing is not None:
            return dict(existing)
        try:
            created = await session.execute(
                text(
                    'insert into "billing_invoices" ("orgId", "billingPeriodStart", "billingPeriodEnd", '
                    '"plan", "billableVehicles", "includedVehicles", "overageVehicles", "platformFeePaise", '
                    '"overagePaise", "usageAddonsPaise", "creditsPaise", "subtotalPaise", "taxPaise", '
                    '"totalPaise", "status") values (:org_id, :period_start, :period_end, :plan, '
                    ':billable, :included, :overage, :platform, :overage_paise, 0, 0, :subtotal, 0, '
                    ':total, \'DRAFT\') returning *'
                ),
                {
                    "org_id": current_user.org_id,
                    "period_start": period_start,
                    "period_end": period_end,
                    "plan": plan["id"],
                    "billable": bill["billable_vehicles"],
                    "included": plan["included_vehicles"],
                    "overage": bill["overage_vehicles"],
                    "platform": bill["platform_fee_paise"],
                    "overage_paise": bill["overage_paise"],
                    "subtotal": bill["subtotal_paise"],
                    "total": bill["subtotal_paise"],
                },
            )
            return dict(created.mappings().one())
        except Exception as exc:
            if "duplicate key" not in str(exc).lower():
                raise
            winner = await session.execute(
                text(
                    'select * from "billing_invoices" where "orgId" = :org_id '
                    'and "billingPeriodStart" = :period_start'
                ),
                {"org_id": current_user.org_id, "period_start": period_start},
            )
            return dict(winner.mappings().one())


@router.post("/billing/invoices/{invoice_id}/test-order", response_model=dict[str, object])
async def create_test_order(
    invoice_id: UUID,
    current_user: TenantUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> dict[str, object]:
    _admin(current_user)
    settings = get_settings()
    if not settings.razorpay_test_key_id or not settings.razorpay_test_key_id.startswith("rzp_test_") or not settings.razorpay_test_key_secret:
        raise HTTPException(status_code=503, detail="Razorpay Test Mode credentials are not configured")
    if settings.production and not settings.razorpay_live_enabled:
        raise HTTPException(status_code=503, detail="Razorpay Test Mode is disabled in production")
    invoice = (
        await session.execute(
            text(
                'select "id", "totalPaise" from "billing_invoices" where "id" = :id and "orgId" = :org_id'
            ),
            {"id": str(invoice_id), "org_id": current_user.org_id},
        )
    ).mappings().first()
    if invoice is None:
        raise HTTPException(status_code=404, detail="Invoice not found in this organization")
    import httpx

    auth = base64.b64encode(
        f"{settings.razorpay_test_key_id}:{settings.razorpay_test_key_secret}".encode()
    ).decode()
    async with httpx.AsyncClient(timeout=20) as client:
        response = await client.post(
            "https://api.razorpay.com/v1/orders",
            headers={"Authorization": f"Basic {auth}"},
            json={
                "amount": max(100, int(invoice["totalPaise"])),
                "currency": "INR",
                "receipt": str(invoice["id"])[:40],
                "notes": {"orgId": current_user.org_id, "invoiceId": str(invoice["id"]), "mode": "TEST"},
            },
        )
    if response.status_code >= 400:
        raise HTTPException(status_code=502, detail="Razorpay Test Mode order request failed")
    return {"key_id": settings.razorpay_test_key_id, "order": response.json()}


@router.post("/billing-test/activate-starter", response_model=dict[str, object])
async def activate_starter(
    current_user: TenantUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> dict[str, object]:
    _admin(current_user)
    async with session.begin():
        result = await session.execute(
            text(
                'update "organizations" set "subscriptionTier" = \'STARTER\', "maxVehicles" = :max_vehicles, '
                '"maxUsers" = :max_users, "billingStatus" = \'ACTIVE\', "subscriptionStartedAt" = now(), '
                '"renewalAt" = now() + interval \'1 month\', "paymentFailedAt" = null, "suspendedAt" = null '
                'where "id" = :org_id and "subscriptionTier" = \'TRIAL_FREE\' returning *'
            ),
            {"org_id": current_user.org_id, "max_vehicles": PLANS["STARTER"]["included_vehicles"], "max_users": PLANS["STARTER"]["max_users"]},
        )
        organization = result.mappings().first()
        if organization is None:
            current = (
                await session.execute(
                    text('select "subscriptionTier", "maxVehicles" from "organizations" where "id" = :org_id'),
                    {"org_id": current_user.org_id},
                )
            ).mappings().first()
            if current is None:
                raise HTTPException(status_code=404, detail="Organization not found")
            return {"activated": False, "already_active": True, "tier": current["subscriptionTier"], "max_vehicles": current["maxVehicles"]}
    return {"activated": True, "already_active": False, "tier": "STARTER", "max_vehicles": PLANS["STARTER"]["included_vehicles"]}


@router.post("/razorpay/webhook", include_in_schema=False)
async def razorpay_webhook(
    request: Request,
    session: AsyncSession = Depends(get_db_session),
) -> JSONResponse:
    settings = get_settings()
    if not settings.razorpay_test_webhook_enabled or not settings.razorpay_test_webhook_secret:
        return JSONResponse({"error": "Webhook processing is disabled"}, status_code=404)
    raw_body = await request.body()
    signature = request.headers.get("x-razorpay-signature")
    expected = hmac.new(
        settings.razorpay_test_webhook_secret.encode(),
        raw_body,
        hashlib.sha256,
    ).hexdigest()
    if not signature or not hmac.compare_digest(expected, signature):
        return JSONResponse({"error": "Invalid webhook signature"}, status_code=400)
    event_id = request.headers.get("x-razorpay-event-id")
    if not event_id or len(event_id) > 200:
        return JSONResponse({"error": "Missing or invalid webhook event id"}, status_code=400)
    try:
        payload = json.loads(raw_body)
    except json.JSONDecodeError:
        return JSONResponse({"error": "Invalid webhook JSON"}, status_code=400)
    event_type = str(payload.get("event", "unknown"))
    async with session.begin():
        recorded = await session.execute(
            text(
                'insert into "razorpay_webhook_events" ("event_id", "event_type") '
                'values (:event_id, :event_type) on conflict ("event_id") do nothing returning "id"'
            ),
            {"event_id": event_id, "event_type": event_type},
        )
        if recorded.first() is None:
            return JSONResponse({"received": True, "event_id": event_id, "duplicate": True})
        subscription = payload.get("payload", {}).get("subscription", {}).get("entity", {})
        org_id = subscription.get("notes", {}).get("orgId")
        if org_id and event_type in {
            "subscription.activated",
            "subscription.charged",
            "subscription.pending",
            "subscription.halted",
        }:
            status = (
                "SUSPENDED"
                if event_type == "subscription.halted"
                else "PAYMENT_GRACE"
                if event_type == "subscription.pending"
                else "ACTIVE"
            )
            await session.execute(
                text(
                    'update "organizations" set "billingStatus" = :status, '
                    '"paymentFailedAt" = case when :status = \'PAYMENT_GRACE\' then now() else null end, '
                    '"suspendedAt" = case when :status = \'SUSPENDED\' then now() else null end '
                    'where "id" = :org_id'
                ),
                {"status": status, "org_id": org_id},
            )
    return JSONResponse({"received": True, "event_id": event_id, "mode": "TEST"})
