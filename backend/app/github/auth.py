import time
from pathlib import Path

import httpx
import jwt

from app.core.config import settings

GITHUB_API_URL = "https://api.github.com"


def create_github_app_jwt() -> str:
    if not settings.GITHUB_APP_ID:
        raise ValueError("GITHUB_APP_ID is not configured.")
    private_key = settings.GITHUB_APP_PRIVATE_KEY.replace("\\\\n", "\\n").strip()
    if not private_key:
        if not settings.GITHUB_PRIVATE_KEY_PATH:
            raise ValueError(
                "GITHUB_APP_PRIVATE_KEY or GITHUB_PRIVATE_KEY_PATH is not configured."
            )
        key_path = Path(settings.GITHUB_PRIVATE_KEY_PATH)
        if not key_path.is_absolute():
            key_path = Path(__file__).resolve().parents[2] / key_path
        if not key_path.exists():
            raise FileNotFoundError(f"GitHub private key file not found: {key_path}")
        private_key = key_path.read_text(encoding="utf-8")
    now = int(time.time())
    return jwt.encode({"iat": now - 60, "exp": now + 600, "iss": settings.GITHUB_APP_ID}, private_key, algorithm="RS256")


def _app_headers() -> dict[str, str]:
    return {"Authorization": f"Bearer {create_github_app_jwt()}", "Accept": "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28"}


async def get_github_app() -> dict:
    async with httpx.AsyncClient(timeout=20) as client:
        response = await client.get(f"{GITHUB_API_URL}/app", headers=_app_headers())
    if response.status_code != 200:
        raise RuntimeError(f"GitHub App authentication failed: {response.status_code}")
    return response.json()


async def get_github_app_installations() -> list:
    async with httpx.AsyncClient(timeout=20) as client:
        response = await client.get(f"{GITHUB_API_URL}/app/installations", headers=_app_headers())
    if response.status_code != 200:
        raise RuntimeError(f"GitHub App installation lookup failed: {response.status_code}")
    return response.json()


async def get_github_app_installation(installation_id: int) -> dict:
    async with httpx.AsyncClient(timeout=20) as client:
        response = await client.get(f"{GITHUB_API_URL}/app/installations/{installation_id}", headers=_app_headers())
    if response.status_code != 200:
        raise RuntimeError(f"GitHub App installation verification failed: {response.status_code}")
    return response.json()


async def get_installation_access_token(installation_id: int) -> str:
    async with httpx.AsyncClient(timeout=20) as client:
        response = await client.post(f"{GITHUB_API_URL}/app/installations/{installation_id}/access_tokens", headers=_app_headers())
    if response.status_code != 201:
        raise RuntimeError(f"GitHub installation token request failed: {response.status_code}")
    token = response.json().get("token")
    if not token:
        raise RuntimeError("GitHub did not return an installation token.")
    return token


async def get_repository_installation_id(owner: str, repo: str) -> int:
    for installation in await get_github_app_installations():
        account = installation.get("account") or {}
        if account.get("login") == owner:
            return installation["id"]
    raise RuntimeError(f"GitHub App installation not found for owner: {owner}")


async def delete_github_app_installation(installation_id: int) -> None:
    async with httpx.AsyncClient(timeout=20) as client:
        response = await client.delete(f"{GITHUB_API_URL}/app/installations/{installation_id}", headers=_app_headers())
    if response.status_code not in {204, 404}:
        raise RuntimeError(f"GitHub App uninstall failed: {response.status_code}")
