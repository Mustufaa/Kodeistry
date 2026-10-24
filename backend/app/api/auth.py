from datetime import datetime, timedelta, timezone
import logging
import secrets
from urllib.parse import urlencode

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from fastapi.responses import RedirectResponse
from jose import JWTError, jwt
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import create_access_token, get_current_user
from app.core.config import settings
from app.core.security import hash_password
from app.crud.tenant import create_personal_workspace
from app.crud.user import authenticate_user, create_user, get_user_by_email, get_user_by_reset_token, get_user_by_verification_token
from app.db.session import get_db
from app.models.user import User
from app.schemas.auth import ForgotPasswordRequest, ResetPasswordRequest, Token, UserLogin, UserRegister
from app.schemas.tenant import CurrentUserResponse, TenantResponse
from app.services.email import send_password_reset_email, send_verification_email
from app.services.token_service import generate_token

router = APIRouter(prefix="/auth", tags=["Authentication"])
logger = logging.getLogger(__name__)
GITHUB_AUTHORIZE_URL = "https://github.com/login/oauth/authorize"
GITHUB_TOKEN_URL = "https://github.com/login/oauth/access_token"
GITHUB_API_URL = "https://api.github.com"


class GitHubOAuthError(RuntimeError):
    def __init__(self, code: str, user_message: str):
        super().__init__(user_message)
        self.code = code
        self.user_message = user_message


def _set_auth_cookie(response: Response, access_token: str) -> None:
    response.set_cookie(settings.AUTH_COOKIE_NAME, access_token, max_age=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60, httponly=True, secure=settings.AUTH_COOKIE_SECURE, samesite=settings.AUTH_COOKIE_SAMESITE, path="/")
    response.set_cookie(settings.CSRF_COOKIE_NAME, secrets.token_urlsafe(32), max_age=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60, httponly=False, secure=settings.AUTH_COOKIE_SECURE, samesite=settings.AUTH_COOKIE_SAMESITE, path="/")


def _delete_auth_cookie(response: Response) -> None:
    for name in (settings.AUTH_COOKIE_NAME, settings.CSRF_COOKIE_NAME):
        response.delete_cookie(name, path="/", secure=settings.AUTH_COOKIE_SECURE, httponly=name == settings.AUTH_COOKIE_NAME, samesite=settings.AUTH_COOKIE_SAMESITE)


def _frontend_redirect(path: str, error: str | None = None) -> RedirectResponse:
    url = f"{settings.FRONTEND_URL.rstrip('/')}{path}"
    if error:
        url = f"{url}?{urlencode({'github_error': error})}"
    return RedirectResponse(url, status_code=302)


@router.post("/register", status_code=status.HTTP_201_CREATED)
async def register(user: UserRegister, db: AsyncSession = Depends(get_db)):
    if await get_user_by_email(db, user.email):
        raise HTTPException(status_code=400, detail="Email already registered")
    verification_token = generate_token()
    expires = datetime.now(timezone.utc) + timedelta(minutes=30)
    await db.rollback()
    async with db.begin():
        db_user = await create_user(db, user, verification_token, expires)
        workspace = await create_personal_workspace(db, db_user)
    await send_verification_email(db_user.email, verification_token)
    return {"message": "Registration successful. Please check your email to verify your account.", "workspace": TenantResponse.model_validate(workspace).model_dump()}


@router.get("/me", response_model=CurrentUserResponse)
async def me(current_user: User = Depends(get_current_user)):
    return current_user


@router.get("/verify-email")
async def verify_email(token: str, db: AsyncSession = Depends(get_db)):
    user = await get_user_by_verification_token(db, token)
    if not user:
        raise HTTPException(status_code=400, detail="Invalid or expired verification token.")
    user.is_verified = True
    user.verification_token = None
    user.verification_token_expiry = None
    await db.commit()
    return {"message": "Email verified successfully."}


@router.post("/login", response_model=Token)
async def login(user: UserLogin, response: Response, db: AsyncSession = Depends(get_db)):
    db_user = await authenticate_user(db, user.email, user.password)
    if not db_user:
        raise HTTPException(status_code=401, detail="Invalid email or password")
    if not db_user.is_verified:
        raise HTTPException(status_code=403, detail="Please verify your email before logging in.")
    access_token = create_access_token({"sub": str(db_user.id), "uid": db_user.id})
    _set_auth_cookie(response, access_token)
    return {"access_token": access_token, "token_type": "bearer"}


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(response: Response, _current_user: User = Depends(get_current_user)):
    _delete_auth_cookie(response)


@router.get("/csrf")
async def csrf_token(
    request: Request,
    response: Response,
    _current_user: User = Depends(get_current_user),
):
    token = request.cookies.get(settings.CSRF_COOKIE_NAME) or secrets.token_urlsafe(32)
    response.set_cookie(
        settings.CSRF_COOKIE_NAME,
        token,
        max_age=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        httponly=False,
        secure=settings.AUTH_COOKIE_SECURE,
        samesite=settings.AUTH_COOKIE_SAMESITE,
        path="/",
    )
    return {"csrf_token": token}


@router.get("/github")
async def github_oauth_start(return_to: str | None = None):
    if not settings.GITHUB_CLIENT_ID or not settings.GITHUB_CLIENT_SECRET:
        raise HTTPException(status_code=503, detail="GitHub OAuth is not configured.")
    state = jwt.encode({"purpose": "github_oauth", "return_to": "/invite" if return_to == "/invite" else None, "nonce": secrets.token_urlsafe(32), "exp": datetime.now(timezone.utc) + timedelta(minutes=10)}, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
    params = {"client_id": settings.GITHUB_CLIENT_ID, "redirect_uri": settings.GITHUB_REDIRECT_URI, "state": state}
    response = RedirectResponse(f"{GITHUB_AUTHORIZE_URL}?{urlencode(params)}", status_code=302)
    response.set_cookie(settings.OAUTH_STATE_COOKIE_NAME, state, max_age=600, httponly=True, secure=settings.AUTH_COOKIE_SECURE, samesite="lax", path="/api/auth/github")
    return response


async def _fetch_github_identity(client: httpx.AsyncClient, code: str) -> tuple[dict, str]:
    token_response = await client.post(
        GITHUB_TOKEN_URL,
        data={
            'client_id': settings.GITHUB_CLIENT_ID,
            'client_secret': settings.GITHUB_CLIENT_SECRET,
            'code': code,
            'redirect_uri': settings.GITHUB_REDIRECT_URI,
        },
        headers={'Accept': 'application/json'},
    )
    if token_response.status_code != 200:
        raise GitHubOAuthError(
            'token_exchange_failed',
            'GitHub rejected the login request. Please start the sign-in again.',
        )
    try:
        token_payload = token_response.json()
    except ValueError as exc:
        raise GitHubOAuthError(
            'invalid_token_response',
            'GitHub returned an invalid login response. Please try again.',
        ) from exc
    github_token = token_payload.get('access_token')
    if not github_token:
        raise GitHubOAuthError(
            'token_exchange_failed',
            'GitHub rejected the login request. Please start the sign-in again.',
        )

    headers = {
        'Authorization': f'Bearer {github_token}',
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
    }
    user_response = await client.get(f'{GITHUB_API_URL}/user', headers=headers)
    if user_response.status_code != 200:
        raise GitHubOAuthError(
            'profile_lookup_failed',
            'GitHub could not provide your profile. Please authorize Kodeistry again.',
        )
    github_user = user_response.json()

    emails_response = await client.get(f'{GITHUB_API_URL}/user/emails', headers=headers)
    if emails_response.status_code in (403, 404):
        raise GitHubOAuthError(
            'email_permission_missing',
            'Kodeistry needs the GitHub App Email addresses permission set to read-only. Update the app permission, then try again.',
        )
    if emails_response.status_code != 200:
        raise GitHubOAuthError(
            'email_lookup_failed',
            'GitHub could not provide your verified email address. Please authorize Kodeistry again.',
        )
    verified = [
        item
        for item in emails_response.json()
        if item.get('verified') and item.get('email')
    ]
    primary = next((item for item in verified if item.get('primary')), None)
    email = (primary or (verified[0] if verified else {})).get('email')
    if not email:
        raise GitHubOAuthError(
            'verified_email_missing',
            'A verified email address is required. Verify an email on GitHub, then try again.',
        )
    return github_user, email.strip().lower()


async def _github_identity(code: str) -> tuple[dict, str]:
    async with httpx.AsyncClient(timeout=20) as client:
        return await _fetch_github_identity(client, code)


def _oauth_failure(message: str, cookie_state: str | None) -> RedirectResponse:
    response = _frontend_redirect("/login", message)
    try:
        payload = jwt.decode(cookie_state or "", settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        if payload.get("purpose") == "github_oauth" and payload.get("return_to") == "/invite":
            response.headers["location"] += "&return_to=%2Finvite"
    except JWTError:
        pass
    response.delete_cookie(settings.OAUTH_STATE_COOKIE_NAME, path="/api/auth/github")
    return response


@router.get("/github/callback")
async def github_oauth_callback(request: Request, code: str | None = None, state: str | None = None, error: str | None = None, db: AsyncSession = Depends(get_db)):
    cookie_state = request.cookies.get(settings.OAUTH_STATE_COOKIE_NAME)
    if error:
        response = _oauth_failure("GitHub authorization was cancelled.", cookie_state)
        response.delete_cookie(settings.OAUTH_STATE_COOKIE_NAME, path="/api/auth/github")
        return response
    if not code or not state or not cookie_state or not secrets.compare_digest(state, cookie_state):
        response = _oauth_failure("Invalid or expired GitHub login session.", cookie_state)
        response.delete_cookie(settings.OAUTH_STATE_COOKIE_NAME, path="/api/auth/github")
        return response
    try:
        state_payload = jwt.decode(state, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        if state_payload.get("purpose") != "github_oauth":
            raise JWTError("invalid state purpose")
        github_user, email = await _github_identity(code)
        github_id = int(github_user["id"])
        login_name = github_user.get("login")
        if not login_name:
            raise RuntimeError("GitHub username is missing")
        user = await db.scalar(select(User).where(User.github_id == github_id))
        email_user = await db.scalar(select(User).where(func.lower(func.trim(User.email)) == email))
        if user is not None and email_user is not None and user.id != email_user.id:
            raise RuntimeError("This GitHub email belongs to another Kodeistry account")
        if user is None and email_user is not None:
            if email_user.github_id not in (None, github_id):
                raise RuntimeError("This email is linked to a different GitHub account")
            user = email_user
        if user is None:
            user = User(
                full_name=github_user.get("name") or login_name,
                email=email,
                github_id=github_id,
                github_login=login_name,
                github_avatar_url=github_user.get("avatar_url"),
                auth_provider="github",
                hashed_password=None,
                is_verified=True,
            )
            db.add(user)
            await db.flush()
        else:
            user.github_id = github_id
            user.github_login = login_name
            user.github_avatar_url = github_user.get("avatar_url")
            user.auth_provider = "github"
            user.is_verified = True
        # The signed state carries only an allowlisted path; invitation secrets stay in the browser.
        invitation_login = state_payload.get("return_to") == "/invite"
        if invitation_login:
            await db.commit()
            response = _frontend_redirect("/invite")
        else:
            from app.api.onboarding import get_onboarding_status
            onboarding = await get_onboarding_status(db, user)
            await db.commit()
            response = _frontend_redirect("/dashboard" if onboarding.onboarding_complete else "/onboarding/github")
        _set_auth_cookie(
            response,
            create_access_token({"sub": str(user.id), "uid": user.id}),
        )
        response.delete_cookie(settings.OAUTH_STATE_COOKIE_NAME, path="/api/auth/github")
        logger.info("GitHub OAuth completed for user_id=%s", user.id)
        return response
    except GitHubOAuthError as exc:
        await db.rollback()
        logger.warning('GitHub OAuth callback failed: %s', exc.code)
        response = _oauth_failure(exc.user_message, cookie_state)
        response.delete_cookie(settings.OAUTH_STATE_COOKIE_NAME, path='/api/auth/github')
        return response
    except (JWTError, KeyError, TypeError, ValueError, RuntimeError, httpx.HTTPError) as exc:
        await db.rollback()
        logger.warning("GitHub OAuth callback failed: %s", type(exc).__name__)
        response = _oauth_failure("GitHub login could not be completed. Please try again.", cookie_state)
        response.delete_cookie(settings.OAUTH_STATE_COOKIE_NAME, path="/api/auth/github")
        return response


@router.post("/forgot-password")
async def forgot_password(request: ForgotPasswordRequest, db: AsyncSession = Depends(get_db)):
    user = await get_user_by_email(db, request.email)
    message = "If the email is registered, a password reset link has been sent."
    if user:
        user.reset_password_token = generate_token()
        user.reset_password_expiry = datetime.now(timezone.utc) + timedelta(minutes=30)
        await db.commit()
        await send_password_reset_email(user.email, user.reset_password_token)
    return {"message": message}


@router.post("/reset-password")
async def reset_password(request: ResetPasswordRequest, db: AsyncSession = Depends(get_db)):
    user = await get_user_by_reset_token(db, request.token)
    if not user:
        raise HTTPException(status_code=400, detail="Invalid or expired reset token.")
    user.hashed_password = hash_password(request.new_password)
    user.reset_password_token = None
    user.reset_password_expiry = None
    await db.commit()
    return {"message": "Password reset successfully."}
