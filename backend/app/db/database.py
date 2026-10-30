from sqlalchemy.engine import make_url
from sqlalchemy.ext.asyncio import create_async_engine
from app.core.config import settings

# Supabase accepts encrypted client connections through its direct and pooler hosts.
_url = make_url(settings.DATABASE_URL)
# Provider URLs often omit the async driver required by this application.
if _url.drivername in {"postgres", "postgresql", "postgresql+psycopg2"}:
    _url = _url.set(drivername="postgresql+asyncpg")
_connect_args = {}
if _url.drivername == "postgresql+asyncpg" and (_url.host or "").endswith(".supabase.com") and "ssl" not in _url.query:
    _connect_args["ssl"] = "require"

engine = create_async_engine(
    _url,
    echo=settings.DATABASE_ECHO,
    hide_parameters=True,
    connect_args=_connect_args,
)
