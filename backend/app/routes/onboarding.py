import hashlib
from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth import AuthIdentity, get_auth_identity
from ..db import get_db_session

router = APIRouter(prefix="/api/v2", tags=["onboarding"])


class InvitationDetails(BaseModel):
    email: str
    role: str
    organization_id: UUID
    organization_name: str
    expires_at: datetime


class AcceptInvitation(BaseModel):
    token: UUID
    full_name: str | None = Field(default=None, min_length=2, max_length=120)


def _token_hash(token: UUID) -> str:
    return hashlib.sha256(str(token).encode("utf-8")).hexdigest()


@router.get("/onboarding/invitation", response_model=InvitationDetails)
async def invitation_details(
    token: UUID,
    session: AsyncSession = Depends(get_db_session),
) -> InvitationDetails:
    result = await session.execute(
        text(
            'select i."email", i."role", i."expiresAt", o."id" as "orgId", '
            'o."name" as "orgName" from "invitations" i join "organizations" o '
            'on o."id" = i."orgId" where i."tokenHash" = :token_hash '
            'and i."acceptedAt" is null and i."revokedAt" is null '
            'and i."expiresAt" > now()'
        ),
        {"token_hash": _token_hash(token)},
    )
    row = result.mappings().first()
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="This invitation is invalid, expired, or already redeemed",
        )
    return InvitationDetails(
        email=row["email"],
        role=row["role"],
        organization_id=row["orgId"],
        organization_name=row["orgName"],
        expires_at=row["expiresAt"],
    )


@router.post("/onboarding/accept-invitation")
async def accept_invitation(
    payload: AcceptInvitation,
    identity: AuthIdentity = Depends(get_auth_identity),
    session: AsyncSession = Depends(get_db_session),
) -> dict[str, object]:
    if not identity.email:
        raise HTTPException(status_code=401, detail="Authenticated email required")
    async with session.begin():
        invite = await session.execute(
            text(
                'select i."id", i."orgId", i."role", i."email", o."name" as "orgName" '
                'from "invitations" i join "organizations" o on o."id" = i."orgId" '
                'where i."tokenHash" = :token_hash and lower(i."email") = lower(:email) '
                'and i."acceptedAt" is null and i."revokedAt" is null '
                'and i."expiresAt" > now() for update'
            ),
            {"token_hash": _token_hash(payload.token), "email": identity.email},
        )
        invite_row = invite.mappings().first()
        if invite_row is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Invitation is invalid, expired, or already redeemed",
            )
        claimed = await session.execute(
            text(
                'update "invitations" set "acceptedAt" = now() where "id" = :invite_id '
                'and "acceptedAt" is null and "revokedAt" is null returning "id"'
            ),
            {"invite_id": invite_row["id"]},
        )
        if claimed.first() is None:
            raise HTTPException(status_code=409, detail="Invitation was already redeemed")
        full_name = payload.full_name or identity.metadata.get("fullName") or identity.email.split("@")[0]
        existing = await session.execute(
            text('select "id" from "users" where "authUserId" = :auth_id'),
            {"auth_id": identity.id},
        )
        if existing.first() is None:
            await session.execute(
                text(
                    'insert into "users" ("authUserId", "orgId", "email", "fullName", "role") '
                    'values (:auth_id, :org_id, :email, :full_name, :role)'
                ),
                {
                    "auth_id": identity.id,
                    "org_id": invite_row["orgId"],
                    "email": identity.email,
                    "full_name": str(full_name),
                    "role": invite_row["role"],
                },
            )
        else:
            await session.execute(
                text(
                    'update "users" set "orgId" = :org_id, "email" = :email, '
                    '"fullName" = :full_name, "role" = :role, "updatedAt" = now() '
                    'where "authUserId" = :auth_id'
                ),
                {
                    "auth_id": identity.id,
                    "org_id": invite_row["orgId"],
                    "email": identity.email,
                    "full_name": str(full_name),
                    "role": invite_row["role"],
                },
            )
    return {
        "email": identity.email,
        "role": invite_row["role"],
        "organizationId": str(invite_row["orgId"]),
        "organizationName": invite_row["orgName"],
    }
