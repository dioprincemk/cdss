"""
main.py
--------
FastAPI application factory.

Mounts all routers, configures middleware, CORS, rate limiting,
static file serving, and startup/shutdown lifecycle events.
"""
import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

from api.routes import (
    ai_routes,
    assessment_routes,
    auth_routes,
    model_routes,
    patient_routes,
    report_routes,
    user_routes,
)
from middleware.logging_middleware import AccessLogMiddleware
from ai.model_registry.registry import get_registry
from core.config.settings import get_settings
from database.connection import engine
from database.models.models import Base
from repositories.assessment_repository import AssessmentRepository
from database.connection import get_db_context

settings = get_settings()
logger = logging.getLogger(__name__)

# ── Rate Limiter ──────────────────────────────────────────────────────────────
limiter = Limiter(key_func=get_remote_address)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Application startup: create DB tables, load active model if present.
    Application shutdown: clean up resources.
    """
    logger.info("Starting CDSS Backend...")

    # Create tables (in production, use Alembic migrations instead)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    logger.info("Database tables ensured.")

    # Auto-load active model from DB into registry
    try:
        async with get_db_context() as db:
            repo = AssessmentRepository(db)
            active_model = await repo.get_active_model()
            if active_model:
                registry = get_registry()
                await registry.load_model(
                    model_id=str(active_model.id),
                    model_path=Path(active_model.file_path),
                    disease_classes=active_model.disease_classes,
                    architecture=active_model.architecture,
                    input_size=active_model.input_size,
                )
                logger.info(f"Auto-loaded active model: {active_model.name}")
            else:
                logger.warning("No active model found in DB. Upload and activate a model.")
    except Exception as e:
        logger.warning(f"Could not auto-load model (non-fatal): {e}")

    yield  # Application runs here

    # Shutdown
    await engine.dispose()
    logger.info("CDSS Backend shutdown complete.")


def create_app() -> FastAPI:
    app = FastAPI(
        title=settings.APP_NAME,
        version=settings.APP_VERSION,
        description="AI-powered Clinical Decision Support System for Pulmonary Disease Assessment",
        docs_url="/api/docs",
        redoc_url="/api/redoc",
        openapi_url="/api/openapi.json",
        lifespan=lifespan,
    )

    # ── Rate Limiting ─────────────────────────────────────────────────────────
    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

    # ── CORS ──────────────────────────────────────────────────────────────────
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.allowed_origins_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # ── Access Log ────────────────────────────────────────────────────────────
    app.add_middleware(AccessLogMiddleware)

    # ── API Routers ───────────────────────────────────────────────────────────
    API_PREFIX = "/api/v1"
    app.include_router(auth_routes.router,       prefix=API_PREFIX)
    app.include_router(patient_routes.router,    prefix=API_PREFIX)
    app.include_router(assessment_routes.router, prefix=API_PREFIX)
    app.include_router(ai_routes.router,         prefix=API_PREFIX)
    app.include_router(model_routes.router,      prefix=API_PREFIX)
    app.include_router(report_routes.router,     prefix=API_PREFIX)
    app.include_router(user_routes.router,       prefix=API_PREFIX)

    # ── Static Files (uploads, gradcam, reports) ──────────────────────────────
    for path, mount in [
        (settings.UPLOAD_DIR,  "/static/uploads"),
        (settings.GRADCAM_DIR, "/static/gradcam"),
        (settings.REPORTS_DIR, "/static/reports"),
    ]:
        path.mkdir(parents=True, exist_ok=True)
        app.mount(mount, StaticFiles(directory=str(path)), name=mount.lstrip("/"))

    @app.get("/health")
    async def health():
        registry = get_registry()
        return {
            "status": "healthy",
            "version": settings.APP_VERSION,
            "model_loaded": registry.is_loaded,
            "active_model_id": registry.active_model_id,
        }

    return app


app = create_app()

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=settings.DEBUG,
        workers=settings.WORKERS,
    )
