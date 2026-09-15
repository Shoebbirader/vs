from fastapi import FastAPI

from .config import get_settings
from .routes.health import router as health_router
from .routes.v2 import router as v2_router


def create_app() -> FastAPI:
    settings = get_settings()
    application = FastAPI(
        title=settings.app_name,
        version=settings.release_version,
        openapi_url="/api/v2/openapi.json" if not settings.production else None,
        docs_url="/api/v2/docs" if not settings.production else None,
        redoc_url="/api/v2/redoc" if not settings.production else None,
    )
    application.include_router(health_router)
    application.include_router(v2_router)
    return application


app = create_app()
