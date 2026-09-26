from fastapi_mail import (
    ConnectionConfig,
    FastMail,
    MessageSchema,
    MessageType,
)

from app.core.config import settings


conf = ConnectionConfig(
    MAIL_USERNAME=settings.MAIL_USERNAME,
    MAIL_PASSWORD=settings.MAIL_PASSWORD,
    MAIL_FROM=settings.MAIL_FROM,
    MAIL_PORT=settings.MAIL_PORT,
    MAIL_SERVER=settings.MAIL_SERVER,
    MAIL_STARTTLS=settings.MAIL_STARTTLS,
    MAIL_SSL_TLS=settings.MAIL_SSL_TLS,
    USE_CREDENTIALS=True,
    VALIDATE_CERTS=True,
)


async def send_verification_email(
    email: str,
    token: str,
) -> None:

    verification_link = (
        f"http://localhost:3000/verify-email?token={token}"
    )

    html = f"""
    <h2>Welcome to Kodeistry</h2>

    <p>Click the button below to verify your email.</p>

    <p>
        <a href="{verification_link}">
            Verify Email
        </a>
    </p>

    <p>
        If you didn't create this account,
        please ignore this email.
    </p>
    """

    message = MessageSchema(
        subject="Verify your Kodeistry account",
        recipients=[email],
        body=html,
        subtype=MessageType.html,
    )

    fm = FastMail(conf)

    await fm.send_message(message)


async def send_password_reset_email(
    email: str,
    token: str,
) -> None:

    reset_link = (
        f"http://localhost:3000/reset-password?token={token}"
    )

    html = f"""
    <h2>Reset Your Password</h2>

    <p>Click the button below to reset your password.</p>

    <p>
        <a href="{reset_link}">
            Reset Password
        </a>
    </p>

    <p>
        This link will expire in 30 minutes.
    </p>

    <p>
        If you didn't request a password reset,
        please ignore this email.
    </p>
    """

    message = MessageSchema(
        subject="Reset your Kodeistry password",
        recipients=[email],
        body=html,
        subtype=MessageType.html,
    )

    fm = FastMail(conf)

    await fm.send_message(message)