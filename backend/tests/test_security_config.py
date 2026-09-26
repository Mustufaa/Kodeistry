import pytest

from app.core.config import _parse_cors_allowed_origins, _validate_secret_key


@pytest.mark.parametrize(
    "secret_key",
    [
        "change-me",
        "your_super_secret_key",
        "a" * 64,
        "short-key",
    ],
)
def test_rejects_weak_or_placeholder_jwt_secret(secret_key):
    with pytest.raises(ValueError, match="SECRET_KEY"):
        _validate_secret_key(secret_key)


def test_accepts_sufficiently_strong_jwt_secret():
    secret_key = "F5!q9R2@v7K4#x8M1p6L3s0WzA9n2B7c4"

    assert _validate_secret_key(secret_key) == secret_key


def test_cors_origins_must_be_explicit_origins():
    assert _parse_cors_allowed_origins(
        "http://localhost:3000, https://app.example.com"
    ) == ["http://localhost:3000", "https://app.example.com"]

    with pytest.raises(ValueError, match="CORS_ALLOWED_ORIGINS"):
        _parse_cors_allowed_origins("*")

    with pytest.raises(ValueError, match="CORS_ALLOWED_ORIGINS"):
        _parse_cors_allowed_origins("https://app.example.com/path")

    with pytest.raises(ValueError, match="CORS_ALLOWED_ORIGINS"):
        _parse_cors_allowed_origins("http://localhost:invalid")
