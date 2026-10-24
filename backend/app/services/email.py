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
        f"{settings.FRONTEND_URL.rstrip('/')}/verify-email?token={token}"
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
        f"{settings.FRONTEND_URL.rstrip('/')}/reset-password?token={token}"
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

async def send_team_invitation_email(email: str, team_name: str, role: str, token: str) -> None:
    from html import escape
    from urllib.parse import urlsplit
    import asyncio

    origin = settings.FRONTEND_URL.rstrip("/")
    parsed = urlsplit(origin)
    if (parsed.scheme not in {"http", "https"} or not parsed.hostname or parsed.path
            or parsed.query or parsed.fragment or parsed.username or parsed.password):
        raise RuntimeError("FRONTEND_URL must be a trusted HTTP(S) origin.")
    if not all((settings.MAIL_USERNAME, settings.MAIL_PASSWORD, settings.MAIL_SERVER, settings.MAIL_FROM)):
        raise RuntimeError("Invitation email delivery is not configured.")
    # Fragments are not sent in HTTP requests or Referer headers.
    link = f"{origin}/invite#token={token}"
    message = MessageSchema(
        subject="You are invited to a Kodeistry team",
        recipients=[email],
        body=f'<h2>Join {escape(team_name)}</h2><p>You have been invited as {escape(role.title())}.</p>'
             f'<p><a href="{escape(link, quote=True)}">Accept invitation</a></p>'
             '<p>This invitation expires in 7 days. If you did not expect it, you can ignore this email.</p>',
        subtype=MessageType.html,
    )
    await asyncio.wait_for(FastMail(conf).send_message(message), timeout=20)
