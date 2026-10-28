from sqlalchemy.engine import make_url
from sqlalchemy.ext.asyncio import create_async_engine
from app.core.config import settings

# Supabase accepts encrypted client connections through its direct and pooler hosts.
_url = make_url(settings.DATABASE_URL)
_connect_args = {}
if _url.drivername == "postgresql+asyncpg" and (_url.host or "").endswith(".supabase.com") and "ssl" not in _url.query:
    _connect_args["ssl"] = "require"

engine = create_async_engine(
    settings.DATABASE_URL,
    echo=settings.DATABASE_ECHO,
    connect_args=_connect_args,
)
