from datetime import datetime, timedelta, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_db_session
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
