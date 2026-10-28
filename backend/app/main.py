import asyncio
import logging

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.exception_handlers import request_validation_exception_handler
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from app.db.database import engine
from app.core.config import settings
from app.core.membership import authorize_team_request
from app.api.team import router as team_router
from app.api import auth
from app.api.secret_scans import router as secret_scan_router, finding_router as secret_finding_router
from app.api.github import router as github_router
from app.api.tenant import router as tenant_router
from app.api.github_installation import router as github_installation_router
from app.api.github_setup import router as github_setup_router
from app.api.repository import router as repository_router
from app.api.review import router as review_router
from app.api.dashboard import router as dashboard_router
from app.api.onboarding import router as onboarding_router
from app.api.analytics import router as analytics_router
from app.api.fix_workflow import router as fix_workflow_router
from app.api.chat import router as chat_router

app = FastAPI(
    title="Kodeistry API",
    version="1.0.0",
    description="AI-powered code review platform for GitHub pull requests.",
)

@app.exception_handler(RequestValidationError)
async def validation_error(request: Request, exc: RequestValidationError):
    if request.url.path.startswith("/api/invitations/"):
        # FastAPI normally echoes invalid inputs, which could disclose a token/password.
        errors = [{key: error[key] for key in ("loc", "msg", "type")} for error in exc.errors()]
        return JSONResponse(status_code=422, content={"detail": errors}, headers={"Cache-Control": "no-store"})
    return await request_validation_exception_handler(request, exc)


app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-CSRF-Token"],
)

app.include_router(auth.router, prefix="/api")
app.include_router(secret_scan_router)
app.include_router(secret_finding_router)

app.include_router(github_router)
app.include_router(github_setup_router)
app.include_router(tenant_router)
app.include_router(team_router)
app.include_router(github_installation_router, dependencies=[Depends(authorize_team_request)])
app.include_router(repository_router, dependencies=[Depends(authorize_team_request)])
app.include_router(review_router, dependencies=[Depends(authorize_team_request)])
app.include_router(dashboard_router, dependencies=[Depends(authorize_team_request)])
app.include_router(onboarding_router)
app.include_router(analytics_router, dependencies=[Depends(authorize_team_request)])
app.include_router(fix_workflow_router, dependencies=[Depends(authorize_team_request)])
app.include_router(chat_router)

@app.middleware("http")
async def private_api_responses(request: Request, call_next):
    response = await call_next(request)
    if request.url.path.startswith("/api/"):
        response.headers["Cache-Control"] = "no-store"
    return response


@app.get("/")
async def root():
    return {"message": "Welcome to Kodeistry API"}


@app.get("/health")
async def health():
    return {
        "status": "healthy",
        "service": "Kodeistry API"
    }


@app.get("/health/db")
async def database_health():
    try:
        async with asyncio.timeout(20):
            async with engine.connect() as connection:
                await connection.execute(text("SELECT 1"))
    except Exception as exc:
        logging.getLogger(__name__).warning("Database health check failed: %s", type(exc).__name__)
        raise HTTPException(status_code=503, detail="Database unavailable") from None
    return {"status": "healthy", "database": "connected"}
