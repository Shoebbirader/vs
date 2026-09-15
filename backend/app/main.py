from fastapi import FastAPI

from .config import get_settings
from .routes.fleet import router as fleet_router
from .routes.health import router as health_router
from .routes.inventory import router as inventory_router
from .routes.issues import router as issues_router
from .routes.maintenance import router as maintenance_router
from .routes.onboarding import router as onboarding_router
from .routes.documents import router as documents_router
from .routes.components import router as components_router
from .routes.procurement import router as procurement_router
from .routes.planning import router as planning_router
from .routes.profile import router as profile_router
from .routes.safety import router as safety_router
from .routes.v2 import router as v2_router
from .routes.vendors import router as vendors_router
from .routes.team import router as team_router
from .routes.notifications import router as notifications_router
from .routes.audit import router as audit_router
from .routes.automation import router as automation_router
from .routes.finance import router as finance_router


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
    application.include_router(components_router)
    application.include_router(inventory_router)
    application.include_router(issues_router)
    application.include_router(v2_router)
    application.include_router(fleet_router)
    application.include_router(maintenance_router)
    application.include_router(onboarding_router)
    application.include_router(procurement_router)
    application.include_router(planning_router)
    application.include_router(profile_router)
    application.include_router(safety_router)
    application.include_router(vendors_router)
    application.include_router(team_router)
    application.include_router(notifications_router)
    application.include_router(audit_router)
    application.include_router(automation_router)
    application.include_router(finance_router)
    return application


app = create_app()
