from fastapi import APIRouter, Depends

from ..auth import AuthIdentity, get_auth_identity
from ..tenant import TenantUser, get_current_user

router = APIRouter(prefix="/api/v2", tags=["compatibility"])


@router.get("/auth/me")
async def current_user(identity: AuthIdentity = Depends(get_auth_identity)) -> dict[str, object]:
    return {
        "id": identity.id,
        "email": identity.email,
        "metadata": identity.metadata,
    }


@router.get("/auth/context")
async def auth_context(
    user: TenantUser = Depends(get_current_user),
) -> dict[str, str | None]:
    return {
        "id": user.id,
        "orgId": user.org_id,
        "role": user.role,
        "fullName": user.full_name,
        "email": user.email,
    }
