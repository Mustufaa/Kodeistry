from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db

from app.schemas.auth import (
    UserRegister,
    UserLogin,
    Token,
    ForgotPasswordRequest,
    ResetPasswordRequest,
)

from app.crud.user import (
    create_user,
    get_user_by_email,
    get_user_by_verification_token,
    get_user_by_reset_token,
    authenticate_user,
)
from app.crud.tenant import create_personal_workspace

from app.core.auth import create_access_token, get_current_user
from app.core.security import hash_password
from app.models.user import User
from app.schemas.tenant import CurrentUserResponse, TenantResponse

from app.services.token_service import generate_token

from app.services.email import (
    send_verification_email,
    send_password_reset_email,
)


router = APIRouter(
    prefix="/auth",
    tags=["Authentication"],
)


# ============================================================
# REGISTER
# ============================================================

@router.post(
    "/register",
    status_code=status.HTTP_201_CREATED,
)
async def register(
    user: UserRegister,
    db: AsyncSession = Depends(get_db),
):
    existing_user = await get_user_by_email(
        db,
        user.email,
    )

    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered",
        )

    # Generate verification token
    verification_token = generate_token()

    # Token expires after 30 minutes
    verification_token_expiry = (
        datetime.now(timezone.utc)
        + timedelta(minutes=30)
    )

    await db.rollback()
    async with db.begin():
        db_user = await create_user(
            db=db,
            user=user,
            verification_token=verification_token,
            verification_token_expiry=verification_token_expiry,
        )
        personal_workspace = await create_personal_workspace(db, db_user)

    await send_verification_email(
        db_user.email,
        verification_token,
    )

    return {
        "message": (
            "Registration successful. "
            "Please check your email to verify your account."
        ),
        "workspace": TenantResponse.model_validate(personal_workspace).model_dump(),
    }


@router.get("/me", response_model=CurrentUserResponse)
async def get_current_user_profile(
    current_user: User = Depends(get_current_user),
):
    return current_user


# ============================================================
# VERIFY EMAIL
# ============================================================

@router.get("/verify-email")
async def verify_email(
    token: str,
    db: AsyncSession = Depends(get_db),
):
    user = await get_user_by_verification_token(
        db,
        token,
    )

    if not user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired verification token.",
        )

    # Verify user
    user.is_verified = True

    # Invalidate verification token
    user.verification_token = None
    user.verification_token_expiry = None

    await db.commit()
    await db.refresh(user)

    return {
        "message": "Email verified successfully."
    }


# ============================================================
# LOGIN
# ============================================================

@router.post(
    "/login",
    response_model=Token,
)
async def login(
    user: UserLogin,
    db: AsyncSession = Depends(get_db),
):
    db_user = await authenticate_user(
        db,
        user.email,
        user.password,
    )

    if not db_user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )

    # User must verify email before login
    if not db_user.is_verified:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Please verify your email before logging in.",
        )

    access_token = create_access_token(
        {
            "sub": db_user.email,
        }
    )

    return {
        "access_token": access_token,
        "token_type": "bearer",
    }


# ============================================================
# FORGOT PASSWORD
# ============================================================

@router.post("/forgot-password")
async def forgot_password(
    request: ForgotPasswordRequest,
    db: AsyncSession = Depends(get_db),
):
    user = await get_user_by_email(
        db,
        request.email,
    )

    # Don't reveal whether email exists
    if not user:
        return {
            "message": (
                "If the email is registered, "
                "a password reset link has been sent."
            )
        }

    # Generate reset token
    reset_token = generate_token()

    user.reset_password_token = reset_token

    # Reset token expires after 30 minutes
    user.reset_password_expiry = (
        datetime.now(timezone.utc)
        + timedelta(minutes=30)
    )

    await db.commit()

    await send_password_reset_email(
        user.email,
        reset_token,
    )

    return {
        "message": (
            "If the email is registered, "
            "a password reset link has been sent."
        )
    }


# ============================================================
# RESET PASSWORD
# ============================================================

@router.post("/reset-password")
async def reset_password(
    request: ResetPasswordRequest,
    db: AsyncSession = Depends(get_db),
):
    user = await get_user_by_reset_token(
        db,
        request.token,
    )

    if not user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired reset token.",
        )

    # Hash new password
    user.hashed_password = hash_password(
        request.new_password
    )

    # Invalidate reset token
    user.reset_password_token = None
    user.reset_password_expiry = None

    await db.commit()
    await db.refresh(user)

    return {
        "message": "Password reset successfully."
    }