import re
from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_db_session
from ..tenant import TenantUser, get_current_user

router = APIRouter(prefix="/api/v2", tags=["profile"])


class ProfileSummary(BaseModel):
    id: UUID
    full_name: str
    email: str
    role: str
    organization_name: str
    mobile_number: str
    sms_alerts_enabled: bool
    whatsapp_alerts_enabled: bool


class ProfileUpdate(BaseModel):
    full_name: str = Field(min_length=2, max_length=120)
    mobile_number: str = ""
    sms_alerts_enabled: bool
    whatsapp_alerts_enabled: bool


class OrganizationSettings(BaseModel):
    timezone: str
    odometer_max_daily_km: int
    labor_rate_per_hour: float
    safety_contact_name: str | None
    safety_contact_phone: str | None


class OrganizationSettingsUpdate(BaseModel):
    timezone: str = Field(min_length=3, max_length=80)
    odometer_max_daily_km: int = Field(ge=100, le=5000)
    labor_rate_per_hour: float = Field(ge=0, le=100000)
    safety_contact_name: str | None = Field(default=None, max_length=160)
    safety_contact_phone: str | None = Field(default=None, max_length=40)


def _mobile(value: str) -> str | None:
    normalized = re.sub(r"[\s()-]", "", value)
    if not normalized:
        return None
    if re.fullmatch(r"\+91[6-9]\d{9}", normalized):
        return normalized
    raise HTTPException(
        status_code=400,
        detail="Use an Indian mobile number in +91XXXXXXXXXX format",
    )


@router.get("/profile", response_model=ProfileSummary)
async def get_profile(
    current_user: TenantUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> ProfileSummary:
    result = await session.execute(
        text(
            'select u."id", u."fullName", u."email", u."role", '
            'o."name" as "organizationName", u."mobileNumber", '
            'u."smsAlertsEnabled", u."whatsappAlertsEnabled" from "users" u '
            'join "organizations" o on o."id" = u."orgId" '
            'where u."id" = :user_id and u."orgId" = :org_id'
        ),
        {"user_id": current_user.id, "org_id": current_user.org_id},
    )
    row = result.mappings().first()
    if row is None:
        raise HTTPException(status_code=404, detail="Profile not found")
    return ProfileSummary(
        id=row["id"],
        full_name=row["fullName"],
        email=row["email"],
        role=row["role"],
        organization_name=row["organizationName"],
        mobile_number=row["mobileNumber"] or "",
        sms_alerts_enabled=row["smsAlertsEnabled"],
        whatsapp_alerts_enabled=row["whatsappAlertsEnabled"],
    )


@router.put("/profile", response_model=ProfileSummary)
async def update_profile(
    payload: ProfileUpdate,
    current_user: TenantUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> ProfileSummary:
    mobile = _mobile(payload.mobile_number)
    if (payload.sms_alerts_enabled or payload.whatsapp_alerts_enabled) and not mobile:
        raise HTTPException(
            status_code=400,
            detail="Save a mobile number before enabling SMS or WhatsApp alerts",
        )
    async with session.begin():
        await session.execute(
            text(
                'update "users" set "fullName" = :full_name, '
                '"mobileNumber" = :mobile_number, '
                '"smsAlertsEnabled" = :sms_enabled, '
                '"whatsappAlertsEnabled" = :whatsapp_enabled, "updatedAt" = now() '
                'where "id" = :user_id and "orgId" = :org_id'
            ),
            {
                "full_name": payload.full_name.strip(),
                "mobile_number": mobile,
                "sms_enabled": bool(mobile and payload.sms_alerts_enabled),
                "whatsapp_enabled": bool(mobile and payload.whatsapp_alerts_enabled),
                "user_id": current_user.id,
                "org_id": current_user.org_id,
            },
        )
    return await get_profile(current_user, session)


@router.get("/organization/settings", response_model=OrganizationSettings)
async def get_organization_settings(
    current_user: TenantUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> OrganizationSettings:
    if current_user.role != "SUPERADMIN":
        raise HTTPException(status_code=403, detail="Superadmin access required")
    result = await session.execute(
        text(
            'select "timezone", "odometerMaxDailyKm", "laborRatePerHour", '
            '"safetyContactName", "safetyContactPhone" from "organization_settings" '
            'where "orgId" = :org_id'
        ),
        {"org_id": current_user.org_id},
    )
    row = result.mappings().first()
    if row is None:
        return OrganizationSettings(
            timezone="Asia/Kolkata",
            odometer_max_daily_km=1000,
            labor_rate_per_hour=0,
            safety_contact_name=None,
            safety_contact_phone=None,
        )
    return OrganizationSettings(
        timezone=row["timezone"],
        odometer_max_daily_km=row["odometerMaxDailyKm"],
        labor_rate_per_hour=float(row["laborRatePerHour"]),
        safety_contact_name=row["safetyContactName"],
        safety_contact_phone=row["safetyContactPhone"],
    )


@router.put("/organization/settings", response_model=OrganizationSettings)
async def update_organization_settings(
    payload: OrganizationSettingsUpdate,
    current_user: TenantUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> OrganizationSettings:
    if current_user.role != "SUPERADMIN":
        raise HTTPException(status_code=403, detail="Superadmin access required")
    async with session.begin():
        existing = await session.execute(
            text('select "id" from "organization_settings" where "orgId" = :org_id'),
            {"org_id": current_user.org_id},
        )
        if existing.first() is None:
            await session.execute(
                text(
                    'insert into "organization_settings" '
                    '("orgId", "timezone", "odometerMaxDailyKm", "laborRatePerHour", '
                    '"safetyContactName", "safetyContactPhone") values '
                    '(:org_id, :timezone, :max_km, :labor_rate, :contact_name, :contact_phone)'
                ),
                {
                    "org_id": current_user.org_id,
                    "timezone": payload.timezone.strip(),
                    "max_km": payload.odometer_max_daily_km,
                    "labor_rate": payload.labor_rate_per_hour,
                    "contact_name": payload.safety_contact_name,
                    "contact_phone": payload.safety_contact_phone,
                },
            )
        else:
            await session.execute(
                text(
                    'update "organization_settings" set "timezone" = :timezone, '
                    '"odometerMaxDailyKm" = :max_km, "laborRatePerHour" = :labor_rate, '
                    '"safetyContactName" = :contact_name, '
                    '"safetyContactPhone" = :contact_phone, "updatedAt" = now() '
                    'where "orgId" = :org_id'
                ),
                {
                    "org_id": current_user.org_id,
                    "timezone": payload.timezone.strip(),
                    "max_km": payload.odometer_max_daily_km,
                    "labor_rate": payload.labor_rate_per_hour,
                    "contact_name": payload.safety_contact_name,
                    "contact_phone": payload.safety_contact_phone,
                },
            )
    return await get_organization_settings(current_user, session)
