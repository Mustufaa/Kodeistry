"""Unhandled backend errors must remain readable by the approved frontend."""
import os
from unittest.mock import AsyncMock

import httpx
import pytest

os.environ.setdefault("DATABASE_URL", "sqlite+aiosqlite:///:memory:")
os.environ.setdefault("JWT_SECRET_KEY", "1234567890abcdef1234567890ABCDEF!")

from app.main import app
from app.api import auth
from app.core.config import settings
from app.db.session import get_db


@pytest.mark.asyncio
@pytest.mark.parametrize("allowed", [True, False])
async def test_registration_failure_cors(monkeypatch, allowed):
    async def fake_db():
        yield AsyncMock()

    monkeypatch.setattr(auth, "get_user_by_email", AsyncMock(side_effect=RuntimeError("private diagnostic")))
    previous = app.dependency_overrides.copy()
    app.dependency_overrides[get_db] = fake_db
    origin = settings.CORS_ALLOWED_ORIGINS[0] if allowed else "https://untrusted.invalid"
    try:
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app, raise_app_exceptions=False), base_url="http://test") as client:
            response = await client.post("/api/auth/register", headers={"Origin": origin},
                                         json={"name": "Test", "email": "test@example.com", "password": "Valid-Pass123!"})
        assert response.status_code == 500
        assert "private diagnostic" not in response.text
        if allowed:
            assert response.headers["access-control-allow-origin"] == origin
            assert response.headers["access-control-allow-credentials"] == "true"
            assert "origin" in response.headers["vary"].lower()
        else:
            assert "access-control-allow-origin" not in response.headers
    finally:
        app.dependency_overrides.clear()
        app.dependency_overrides.update(previous)


@pytest.mark.asyncio
async def test_preflight_and_success():
    origin = settings.CORS_ALLOWED_ORIGINS[0]
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        preflight = await client.options("/api/auth/register", headers={
            "Origin": origin, "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type",
        })
        health = await client.get("/health", headers={"Origin": origin})
    for response in (preflight, health):
        assert response.status_code == 200
        assert response.headers["access-control-allow-origin"] == origin
