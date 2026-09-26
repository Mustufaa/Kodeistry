from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.api import auth
from app.api.github import router as github_router
from app.api.tenant import router as tenant_router
from app.api.github_installation import router as github_installation_router
from app.api.repository import router as repository_router
from app.api.review import router as review_router

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
    allow_headers=["Authorization", "Content-Type"],
)

app.include_router(auth.router, prefix="/api")

app.include_router(github_router)
app.include_router(tenant_router)
app.include_router(github_installation_router)
app.include_router(repository_router)
app.include_router(review_router)

@app.get("/")
async def root():
    return {"message": "Welcome to Kodeistry API"}


@app.get("/health")
async def health():
    return {
        "status": "healthy",
        "service": "Kodeistry API"
    }