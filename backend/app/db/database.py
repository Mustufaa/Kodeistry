from sqlalchemy.ext.asyncio import create_async_engine
from app.core.config import settings

# Create Async SQLAlchemy Engine
engine = create_async_engine(
    settings.DATABASE_URL,
    echo=settings.DATABASE_ECHO,
)