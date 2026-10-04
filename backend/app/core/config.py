from decouple import config
from urllib.parse import urlsplit


def _validate_secret_key(secret_key: str) -> str:
    normalized_key = secret_key.strip().lower()
    placeholder_markers = (
        "change-me",
        "changeme",
        "your_",
        "secret",
        "password",
        "placeholder",
        "example",
        "test-secret",
    )

    if (
        len(secret_key.encode("utf-8")) < 32
        or len(set(secret_key)) < 16
        or any(marker in normalized_key for marker in placeholder_markers)
    ):
        raise ValueError(
            "SECRET_KEY must be at least 32 bytes and must not be "
            "a placeholder or low-complexity value."
        )

    return secret_key


def _parse_cors_allowed_origins(value: str) -> list[str]:
    origins = [origin.strip() for origin in value.split(",") if origin.strip()]
    for origin in origins:
        parsed = urlsplit(origin)
        try:
            parsed.port
        except ValueError:
            raise ValueError(
                "CORS_ALLOWED_ORIGINS must contain explicit HTTP(S) origins; "
                "wildcard origins are not allowed."
            ) from None
        if (
            origin == "*"
            or parsed.scheme not in {"http", "https"}
            or not parsed.hostname
            or parsed.path
            or parsed.query
            or parsed.fragment
            or parsed.username
            or parsed.password
            or parsed.netloc.endswith(":")
        ):
            raise ValueError(
                "CORS_ALLOWED_ORIGINS must contain explicit HTTP(S) origins; "
                "wildcard origins are not allowed."
            )
    return origins


class Settings:

    # ============================================================
    # Database
    # ============================================================

    DATABASE_URL: str = config(
        "DATABASE_URL"
    )
    DATABASE_ECHO: bool = config(
        "DATABASE_ECHO",
        cast=bool,
        default=False,
    )
    CORS_ALLOWED_ORIGINS: list[str] = _parse_cors_allowed_origins(
        config(
            "CORS_ALLOWED_ORIGINS",
            default="http://localhost:3000,http://127.0.0.1:3000",
        )
    )


    # ============================================================
    # JWT
    # ============================================================

    SECRET_KEY: str = _validate_secret_key(
        config("JWT_SECRET_KEY", default=config("SECRET_KEY", default=""))
    )

    ALGORITHM: str = config(
        "ALGORITHM",
        default="HS256",
    )

    ACCESS_TOKEN_EXPIRE_MINUTES: int = config(
        "ACCESS_TOKEN_EXPIRE_MINUTES",
        cast=int,
        default=30,
    )

    AUTH_COOKIE_NAME: str = config(
        "AUTH_COOKIE_NAME",
        default="kodeistry_session",
    )

    CSRF_COOKIE_NAME: str = config(
        "CSRF_COOKIE_NAME",
        default="kodeistry_csrf",
    )

    AUTH_COOKIE_SECURE: bool = config(
        "AUTH_COOKIE_SECURE",
        cast=bool,
        default=False,
    )

    AUTH_COOKIE_SAMESITE: str = config(
        "AUTH_COOKIE_SAMESITE",
        default="lax",
    ).lower()

    OAUTH_STATE_COOKIE_NAME: str = config(
        "OAUTH_STATE_COOKIE_NAME",
        default="kodeistry_oauth_state",
    )

    GITHUB_SETUP_STATE_COOKIE_NAME: str = config(
        "GITHUB_SETUP_STATE_COOKIE_NAME",
        default="kodeistry_github_setup_state",
    )


    # ============================================================
    # Email
    # ============================================================

    MAIL_USERNAME: str = config(
        "MAIL_USERNAME"
    )

    MAIL_PASSWORD: str = config(
        "MAIL_PASSWORD"
    )

    MAIL_FROM: str = config(
        "MAIL_FROM"
    )

    MAIL_PORT: int = config(
        "MAIL_PORT",
        cast=int,
        default=587,
    )

    MAIL_SERVER: str = config(
        "MAIL_SERVER",
        default="smtp.gmail.com",
    )

    MAIL_STARTTLS: bool = config(
        "MAIL_STARTTLS",
        cast=bool,
        default=True,
    )

    MAIL_SSL_TLS: bool = config(
        "MAIL_SSL_TLS",
        cast=bool,
        default=False,
    )


    # ============================================================
    # GitHub App
    # ============================================================

    GITHUB_APP_ID: str = config(
        "GITHUB_APP_ID",
        default="",
    )

    GITHUB_CLIENT_ID: str = config(
        "GITHUB_CLIENT_ID",
        default="",
    )

    GITHUB_APP_SLUG: str = config(
        "GITHUB_APP_SLUG",
        default="kodeistry",
    )

    GITHUB_CLIENT_SECRET: str = config(
        "GITHUB_CLIENT_SECRET",
        default="",
    )

    BACKEND_URL: str = config(
        "BACKEND_URL",
        default="http://localhost:8000",
    ).rstrip("/")

    GITHUB_REDIRECT_URI: str = config(
        "GITHUB_REDIRECT_URI",
        default=f"{BACKEND_URL}/api/auth/github/callback",
    )

    FRONTEND_URL: str = config(
        "FRONTEND_URL",
        default="http://localhost:3000",
    )

    GITHUB_PRIVATE_KEY_PATH: str = config(
        "GITHUB_PRIVATE_KEY_PATH",
        default="",
    )

    GITHUB_APP_PRIVATE_KEY: str = config(
        "GITHUB_APP_PRIVATE_KEY",
        default="",
    )

    GITHUB_WEBHOOK_SECRET: str = config(
        "GITHUB_WEBHOOK_SECRET",
        default="",
    )


    # ============================================================
    # Gemini
    # ============================================================

    GEMINI_API_KEY: str = config(
        "GEMINI_API_KEY",
        default="",
    )

    GEMINI_MODEL: str = config(
        "GEMINI_MODEL",
        default="gemini-3-flash-preview",
    )


    # ============================================================
    # OpenRouter
    # ============================================================

    OPENROUTER_API_KEY: str = config(
        "OPENROUTER_API_KEY",
        default="",
    )

    OPENROUTER_MODEL: str = config(
        "OPENROUTER_MODEL",
        default="google/gemma-4-31b-it:free",
    )


# ============================================================
# Settings Instance
# ============================================================

settings = Settings()
