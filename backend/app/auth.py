from dataclasses import dataclass

import httpx
from fastapi import HTTPException, Request, status

from .config import get_settings


@dataclass(frozen=True)
class AuthIdentity:
    id: str
    email: str | None
    metadata: dict[str, object]


def _bearer_token(request: Request) -> str | None:
    authorization = request.headers.get("authorization", "")
    if authorization.lower().startswith("bearer "):
        return authorization[7:].strip() or None
    return request.cookies.get("sb-access-token") or request.cookies.get(
        "supabase-auth-token"
    )


async def get_auth_identity(request: Request) -> AuthIdentity:
    settings = get_settings()
    token = _bearer_token(request)
    if not token or not settings.supabase_url or not settings.supabase_anon_key:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
        )

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.get(
                f"{settings.supabase_url.rstrip('/')}/auth/v1/user",
                headers={
                    "apikey": settings.supabase_anon_key,
                    "Authorization": f"Bearer {token}",
                },
            )
        response.raise_for_status()
        payload = response.json()
        user_id = payload.get("id")
        if not isinstance(user_id, str) or not user_id:
            raise ValueError("Supabase user response did not contain an id")
        metadata = payload.get("user_metadata")
        return AuthIdentity(
            id=user_id,
            email=payload.get("email") if isinstance(payload.get("email"), str) else None,
            metadata=metadata if isinstance(metadata, dict) else {},
        )
    except (httpx.HTTPError, ValueError) as error:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication credentials",
        ) from error
