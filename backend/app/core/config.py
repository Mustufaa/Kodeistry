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
            default="http://localhost:3000",
        )
    )


    # ============================================================
    # JWT
    # ============================================================

    SECRET_KEY: str = _validate_secret_key(config("SECRET_KEY"))

    ALGORITHM: str = config(
        "ALGORITHM",
        default="HS256",
    )

    ACCESS_TOKEN_EXPIRE_MINUTES: int = config(
        "ACCESS_TOKEN_EXPIRE_MINUTES",
        cast=int,
        default=30,
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

    GITHUB_CLIENT_SECRET: str = config(
        "GITHUB_CLIENT_SECRET",
        default="",
    )

    GITHUB_PRIVATE_KEY_PATH: str = config(
        "GITHUB_PRIVATE_KEY_PATH",
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