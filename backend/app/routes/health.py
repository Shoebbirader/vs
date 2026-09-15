from datetime import datetime, timezone

from fastapi import APIRouter, Depends

from ..config import Settings, get_settings
from ..db import check_database

router = APIRouter(tags=["system"])


@router.get("/healthz")
async def health(settings: Settings = Depends(get_settings)) -> dict[str, object]:
    return {
        "ok": True,
        "service": settings.app_name,
        "release": settings.release_version,
        "checkedAt": datetime.now(timezone.utc).isoformat(),
    }


@router.get("/readyz")
async def readiness(settings: Settings = Depends(get_settings)) -> dict[str, object]:
    database_ok = await check_database()
    configuration_ok = settings.configuration_ready or not settings.production
    result = {
        "ok": database_ok and configuration_ok,
        "release": settings.release_version,
        "service": settings.app_name,
        "environment": settings.environment,
        "database": "ok" if database_ok else "degraded",
        "configuration": "ok" if configuration_ok else "degraded",
        "checkedAt": datetime.now(timezone.utc).isoformat(),
    }
    return result
