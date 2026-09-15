from fastapi import FastAPI

from .config import get_settings
from .routes.fleet import router as fleet_router
from .routes.health import router as health_router
from .routes.inventory import router as inventory_router
from .routes.issues import router as issues_router
from .routes.maintenance import router as maintenance_router
from .routes.documents import router as documents_router
from .routes.procurement import router as procurement_router
from .routes.safety import router as safety_router
from .routes.v2 import router as v2_router
from .routes.vendors import router as vendors_router


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
    application.include_router(documents_router)
    application.include_router(inventory_router)
    application.include_router(issues_router)
    application.include_router(v2_router)
    application.include_router(fleet_router)
    application.include_router(maintenance_router)
    application.include_router(procurement_router)
    application.include_router(safety_router)
    application.include_router(vendors_router)
    return application


app = create_app()
