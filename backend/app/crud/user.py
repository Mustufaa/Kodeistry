from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User
from app.schemas.auth import UserRegister
from app.core.security import hash_password, verify_password


async def get_user_by_email(
    db: AsyncSession,
    email: str,
):
    """
    Retrieve a user by email.
    """
    result = await db.execute(
        select(User).where(User.email == email)
    )

    return result.scalar_one_or_none()


async def get_user_by_verification_token(
    db: AsyncSession,
    token: str,
):
    """
    Retrieve a user by a valid verification token.
    """

    result = await db.execute(
        select(User).where(
            User.verification_token == token,
            User.verification_token_expiry
            > datetime.now(timezone.utc),
        )
    )

    return result.scalar_one_or_none()


async def get_user_by_reset_token(
    db: AsyncSession,
    token: str,
):
    """
    Retrieve a user by a valid password reset token.
    """

    result = await db.execute(
        select(User).where(
            User.reset_password_token == token,
            User.reset_password_expiry
            > datetime.now(timezone.utc),
        )
    )

    return result.scalar_one_or_none()


async def create_user(
    db: AsyncSession,
    user: UserRegister,
    verification_token: str,
    verification_token_expiry: datetime,
):
    """
    Create a new user.
    """

    db_user = User(
        full_name=user.name,
        email=user.email,
        hashed_password=hash_password(user.password),
        is_verified=False,
        verification_token=verification_token,
        verification_token_expiry=verification_token_expiry,
    )

    db.add(db_user)

    await db.flush()

    return db_user


async def authenticate_user(
    db: AsyncSession,
    email: str,
    password: str,
):
    """
    Authenticate a user.
    """

    user = await get_user_by_email(
        db,
        email,
    )

    if not user:
        return None

    if not user.hashed_password or not verify_password(
        password,
        user.hashed_password,
    ):
        return None

    return user
