from fastapi import APIRouter, Depends

from ..auth import AuthIdentity, get_auth_identity

router = APIRouter(prefix="/api/v2", tags=["compatibility"])


@router.get("/auth/me")
async def current_user(identity: AuthIdentity = Depends(get_auth_identity)) -> dict[str, object]:
    return {
        "id": identity.id,
        "email": identity.email,
        "metadata": identity.metadata,
    }
