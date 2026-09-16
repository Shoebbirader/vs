from dataclasses import dataclass

from fastapi import Depends, HTTPException, status
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from .auth import AuthIdentity, get_auth_identity
from .db import get_db_session


@dataclass(frozen=True)
class TenantUser:
    id: str
    org_id: str
    role: str
    full_name: str | None
    email: str | None


async def get_current_user(
    identity: AuthIdentity = Depends(get_auth_identity),
    session: AsyncSession = Depends(get_db_session),
) -> TenantUser:
    result = await session.execute(
        text(
            'select "id", "orgId", "role", "fullName", "email" '
            'from "users" where "authUserId" = :auth_user_id or "email" = :email '
            'order by case when "authUserId" = :auth_user_id then 0 else 1 end '
            "limit 1"
        ),
        {"auth_user_id": identity.id, "email": identity.email},
    )
    row = result.mappings().first()
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Authenticated user is not provisioned for VahanSync",
        )
    return TenantUser(
        id=str(row["id"]),
        org_id=str(row["orgId"]),
        role=str(row["role"]),
        full_name=row["fullName"],
        email=row["email"],
    )
