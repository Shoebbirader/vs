import posixpath
import httpx
from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from pydantic import BaseModel, Field

from ..config import get_settings
from ..tenant import TenantUser, get_current_user

router = APIRouter(prefix="/api/v2/storage", tags=["storage"])


class SignedUrlResponse(BaseModel):
    key: str
    signed_url: str
    expires_in: int


class StorageDelete(BaseModel):
    key: str = Field(min_length=1, max_length=500)


def _storage_config() -> tuple[str, str, str]:
    settings = get_settings()
    if not settings.supabase_url or not settings.supabase_service_role_key:
        raise HTTPException(status_code=503, detail="Supabase Storage is not configured")
    return settings.supabase_url.rstrip("/"), settings.supabase_service_role_key, settings.supabase_storage_bucket


def _safe_key(user: TenantUser, key: str) -> str:
    normalized = posixpath.normpath(key).lstrip("/")
    if normalized in {".", ".."} or normalized.startswith("../") or not normalized.startswith(f"org/{user.org_id}/"):
        raise HTTPException(status_code=403, detail="Storage key is outside this organization")
    return normalized


def _headers(service_key: str, content_type: str | None = None) -> dict[str, str]:
    headers = {"apikey": service_key, "Authorization": f"Bearer {service_key}"}
    if content_type:
        headers["Content-Type"] = content_type
    return headers


@router.post("/upload", response_model=dict[str, str], status_code=201)
async def upload_file(
    key: str = Query(min_length=1, max_length=500),
    file: UploadFile = File(...),
    current_user: TenantUser = Depends(get_current_user),
) -> dict[str, str]:
    base_url, service_key, bucket = _storage_config()
    safe_key = _safe_key(current_user, key)
    content = await file.read()
    if len(content) > 50 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="File exceeds the 50MB storage limit")
    async with httpx.AsyncClient(timeout=30) as client:
        response = await client.post(
            f"{base_url}/storage/v1/object/{bucket}/{safe_key}",
            headers={**_headers(service_key, file.content_type or "application/octet-stream"), "x-upsert": "false"},
            content=content,
        )
    if response.status_code >= 400:
        raise HTTPException(status_code=502, detail="Supabase Storage upload failed")
    return {"key": safe_key, "content_type": file.content_type or "application/octet-stream"}


@router.post("/signed-url", response_model=SignedUrlResponse)
async def signed_url(
    key: str = Query(min_length=1, max_length=500),
    expires_in: int = Query(default=3600, ge=60, le=86_400),
    current_user: TenantUser = Depends(get_current_user),
) -> SignedUrlResponse:
    base_url, service_key, bucket = _storage_config()
    safe_key = _safe_key(current_user, key)
    async with httpx.AsyncClient(timeout=20) as client:
        response = await client.post(
            f"{base_url}/storage/v1/object/sign/{bucket}/{safe_key}",
            headers=_headers(service_key, "application/json"),
            json={"expiresIn": expires_in},
        )
    if response.status_code >= 400:
        raise HTTPException(status_code=502, detail="Supabase Storage signing failed")
    signed = response.json().get("signedURL")
    if not isinstance(signed, str) or not signed:
        raise HTTPException(status_code=502, detail="Supabase Storage returned no signed URL")
    return SignedUrlResponse(
        key=safe_key,
        signed_url=f"{base_url}/storage/v1{signed}" if signed.startswith("/") else signed,
        expires_in=expires_in,
    )


@router.delete("/object", status_code=204)
async def delete_file(
    payload: StorageDelete,
    current_user: TenantUser = Depends(get_current_user),
) -> None:
    base_url, service_key, bucket = _storage_config()
    safe_key = _safe_key(current_user, payload.key)
    async with httpx.AsyncClient(timeout=20) as client:
        response = await client.post(
            f"{base_url}/storage/v1/object/remove/{bucket}",
            headers=_headers(service_key, "application/json"),
            json={"prefixes": [safe_key]},
        )
    if response.status_code >= 400:
        raise HTTPException(status_code=502, detail="Supabase Storage deletion failed")
