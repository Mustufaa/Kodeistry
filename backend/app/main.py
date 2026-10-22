from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
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

app = FastAPI(
    title="Kodeistry API",
    version="1.0.0",
    description="AI-powered code review platform for GitHub pull requests.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-CSRF-Token", "ngrok-skip-browser-warning"],
)

app.include_router(auth.router, prefix="/api")
app.include_router(secret_scan_router)
app.include_router(secret_finding_router)

app.include_router(github_router)
app.include_router(github_setup_router)
app.include_router(tenant_router)
app.include_router(github_installation_router)
app.include_router(repository_router)
app.include_router(review_router)
app.include_router(dashboard_router)
app.include_router(onboarding_router)
app.include_router(analytics_router)
app.include_router(fix_workflow_router)

@app.get("/")
async def root():
    return {"message": "Welcome to Kodeistry API"}


@app.get("/health")
async def health():
    return {
        "status": "healthy",
        "service": "Kodeistry API"
    }
