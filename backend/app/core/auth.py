from datetime import datetime, timedelta, timezone
import hmac

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.db.session import get_db
from app.models.user import User

SECRET_KEY = settings.SECRET_KEY
ALGORITHM = settings.ALGORITHM
ACCESS_TOKEN_EXPIRE_MINUTES = settings.ACCESS_TOKEN_EXPIRE_MINUTES
bearer_scheme = HTTPBearer(auto_error=False)


def create_access_token(data: dict) -> str:
    to_encode = data.copy()
    to_encode["exp"] = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def decode_access_token(token: str):
    try:
        return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError:
        return None


async def get_current_user(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    token = credentials.credentials if credentials is not None else request.cookies.get(settings.AUTH_COOKIE_NAME)
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated", headers={"WWW-Authenticate": "Bearer"})
    if credentials is None and request.method not in {"GET", "HEAD", "OPTIONS"}:
        csrf_cookie = request.cookies.get(settings.CSRF_COOKIE_NAME)
        csrf_header = request.headers.get("X-CSRF-Token")
        if not csrf_cookie or not csrf_header or not hmac.compare_digest(csrf_cookie, csrf_header):
            raise HTTPException(status_code=403, detail="Invalid CSRF token.")
    payload = decode_access_token(token)
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid or expired token.", headers={"WWW-Authenticate": "Bearer"})
    user_id = payload.get("uid")
    subject = payload.get("sub")
    if user_id is None and not subject:
        raise HTTPException(status_code=401, detail="Invalid token payload.", headers={"WWW-Authenticate": "Bearer"})
    if user_id is not None:
        try:
            user = await db.scalar(select(User).where(User.id == int(user_id)))
        except (TypeError, ValueError):
            user = None
    else:
        # Backward compatibility for sessions issued before user IDs were embedded.
        user = await db.scalar(select(User).where(User.email == subject))
    if user is None:
        raise HTTPException(status_code=401, detail="User not found.", headers={"WWW-Authenticate": "Bearer"})
    if not user.is_verified:
        raise HTTPException(status_code=403, detail="Please verify your email before continuing.")
    from app.core.repository_access import scope_session
    scope_session(db, user.id)
    return user
