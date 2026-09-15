from datetime import datetime, timedelta, timezone
import hashlib
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import get_settings
from ..db import get_db_session
from ..tenant import TenantUser, get_current_user

router = APIRouter(prefix="/api/v2", tags=["team"])


class MemberSummary(BaseModel):
    id: UUID
    email: str
    full_name: str
    role: str
    created_at: datetime


class AssignableMember(BaseModel):
    id: UUID
    full_name: str
    role: str


class InvitationSummary(BaseModel):
    id: UUID
    email: str
    role: str
    expires_at: datetime
    accepted_at: datetime | None
    revoked_at: datetime | None
    resend_count: int
    last_sent_at: datetime | None
    created_at: datetime


class InviteMember(BaseModel):
    email: str = Field(min_length=3, max_length=320)
    role: str = Field(
        pattern="^(FLEET_MANAGER|MECHANIC|TECHNICIAN|DRIVER|INVENTORY_MANAGER|ACCOUNTANT)$"
    )


class RevokeInvitation(BaseModel):
    reason: str = Field(min_length=3, max_length=500)


def _superadmin(user: TenantUser) -> None:
    if user.role != "SUPERADMIN":
        raise HTTPException(status_code=403, detail="Superadmin access required")


def _management(user: TenantUser) -> None:
    if user.role not in {"SUPERADMIN", "FLEET_MANAGER"}:
        raise HTTPException(status_code=403, detail="Fleet management access required")


def _token_hash(token: UUID) -> str:
    return hashlib.sha256(str(token).encode("utf-8")).hexdigest()


def _member(row: dict[str, object]) -> MemberSummary:
    return MemberSummary(
        id=row["id"],
        email=row["email"],
        full_name=row["fullName"],
        role=row["role"],
        created_at=row["createdAt"],
    )


def _invitation(row: dict[str, object]) -> InvitationSummary:
    return InvitationSummary(
        id=row["id"],
        email=row["email"],
        role=row["role"],
        expires_at=row["expiresAt"],
        accepted_at=row["acceptedAt"],
        revoked_at=row["revokedAt"],
        resend_count=row["resendCount"],
        last_sent_at=row["lastSentAt"],
        created_at=row["createdAt"],
    )


@router.get("/team/members", response_model=list[MemberSummary])
async def list_members(
    current_user: TenantUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> list[MemberSummary]:
    _superadmin(current_user)
    result = await session.execute(
        text(
            'select "id", "email", "fullName", "role", "createdAt" from "users" '
            'where "orgId" = :org_id order by "fullName"'
        ),
        {"org_id": current_user.org_id},
    )
    return [_member(row) for row in result.mappings()]


@router.get("/team/assignable-members", response_model=list[AssignableMember])
async def list_assignable_members(
    current_user: TenantUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> list[AssignableMember]:
    _management(current_user)
    result = await session.execute(
        text(
            'select "id", "fullName", "role" from "users" where "orgId" = :org_id '
            'and "role" in (\'MECHANIC\', \'TECHNICIAN\') order by "fullName"'
        ),
        {"org_id": current_user.org_id},
    )
    return [
        AssignableMember(id=row["id"], full_name=row["fullName"], role=row["role"])
        for row in result.mappings()
    ]


@router.get("/team/invitations", response_model=list[InvitationSummary])
async def list_invitations(
    current_user: TenantUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> list[InvitationSummary]:
    _superadmin(current_user)
    result = await session.execute(
        text(
            'select "id", "email", "role", "expiresAt", "acceptedAt", "revokedAt", '
            '"resendCount", "lastSentAt", "createdAt" from "invitations" '
            'where "orgId" = :org_id order by "createdAt" desc'
        ),
        {"org_id": current_user.org_id},
    )
    return [_invitation(row) for row in result.mappings()]


async def _invitation_response(
    row: dict[str, object], token: UUID
) -> dict[str, object]:
    settings = get_settings()
    origin = settings.public_app_url or "https://fleetops-v2.vercel.app"
    return {**_invitation(row).model_dump(mode="json"), "join_url": f"{origin.rstrip('/')}/join/{token}"}


@router.post("/team/invitations", response_model=dict[str, object], status_code=201)
async def invite_member(
    payload: InviteMember,
    current_user: TenantUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> dict[str, object]:
    _superadmin(current_user)
    email = payload.email.strip().lower()
    token = uuid4()
    expires_at = datetime.now(timezone.utc) + timedelta(days=7)
    async with session.begin():
        active = await session.execute(
            text(
                'select "id" from "invitations" where "orgId" = :org_id and lower("email") = :email '
                'and "acceptedAt" is null and "revokedAt" is null and "expiresAt" > now()'
            ),
            {"org_id": current_user.org_id, "email": email},
        )
        if active.first() is not None:
            raise HTTPException(status_code=409, detail="An active invitation already exists for this email")
        created = await session.execute(
            text(
                'insert into "invitations" ("orgId", "email", "role", "tokenHash", "expiresAt", '
                '"lastSentAt") values (:org_id, :email, :role, :token_hash, :expires_at, now()) '
                'returning "id", "email", "role", "expiresAt", "acceptedAt", "revokedAt", '
                '"resendCount", "lastSentAt", "createdAt"'
            ),
            {
                "org_id": current_user.org_id,
                "email": email,
                "role": payload.role,
                "token_hash": _token_hash(token),
                "expires_at": expires_at,
            },
        )
        row = created.mappings().one()
    return await _invitation_response(row, token)


@router.post("/team/invitations/{invitation_id}/resend", response_model=dict[str, object])
async def resend_invitation(
    invitation_id: UUID,
    current_user: TenantUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> dict[str, object]:
    _superadmin(current_user)
    token = uuid4()
    expires_at = datetime.now(timezone.utc) + timedelta(days=7)
    async with session.begin():
        current = await session.execute(
            text(
                'select "id", "email", "role", "expiresAt", "acceptedAt", "revokedAt", '
                '"resendCount", "lastSentAt", "createdAt" from "invitations" '
                'where "id" = :id and "orgId" = :org_id for update'
            ),
            {"id": str(invitation_id), "org_id": current_user.org_id},
        )
        existing = current.mappings().first()
        if existing is None:
            raise HTTPException(status_code=404, detail="Invitation not found")
        if existing["acceptedAt"] or existing["revokedAt"]:
            raise HTTPException(status_code=400, detail="Accepted or revoked invitations cannot be resent")
        updated = await session.execute(
            text(
                'update "invitations" set "tokenHash" = :token_hash, "expiresAt" = :expires_at, '
                '"resendCount" = "resendCount" + 1, "lastSentAt" = now() '
                'where "id" = :id returning "id", "email", "role", "expiresAt", "acceptedAt", '
                '"revokedAt", "resendCount", "lastSentAt", "createdAt"'
            ),
            {
                "id": str(invitation_id),
                "token_hash": _token_hash(token),
                "expires_at": expires_at,
            },
        )
        row = updated.mappings().one()
    return await _invitation_response(row, token)


@router.post("/team/invitations/{invitation_id}/revoke", response_model=InvitationSummary)
async def revoke_invitation(
    invitation_id: UUID,
    payload: RevokeInvitation,
    current_user: TenantUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> InvitationSummary:
    _superadmin(current_user)
    async with session.begin():
        result = await session.execute(
            text(
                'update "invitations" set "revokedAt" = coalesce("revokedAt", now()), '
                '"revokedById" = coalesce("revokedById", :actor_id) where "id" = :id '
                'and "orgId" = :org_id and "acceptedAt" is null returning "id", "email", "role", '
                '"expiresAt", "acceptedAt", "revokedAt", "resendCount", "lastSentAt", "createdAt"'
            ),
            {
                "id": str(invitation_id),
                "org_id": current_user.org_id,
                "actor_id": current_user.id,
            },
        )
        row = result.mappings().first()
        if row is None:
            raise HTTPException(status_code=404, detail="Invitation not found or already accepted")
    return _invitation(row)
