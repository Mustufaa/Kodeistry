import asyncio
from datetime import datetime, timezone

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.api.onboarding import claim_tour_invitation, update_tutorial_status, TutorialUpdate
from app.db.base import Base
from app.models.user import User
from app.main import app  # Register all related models.


@pytest.mark.asyncio
async def test_account_invitation_claim_is_atomic_and_permanent(tmp_path):
    engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path / 'tour.db'}")
    sessions = async_sessionmaker(engine, expire_on_commit=False)
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    async with sessions() as db:
        db.add_all([
            User(full_name="New", email="new@example.com"),
            User(full_name="Other", email="other@example.com"),
            User(full_name="Manual", email="manual@example.com"),
            User(full_name="Existing", email="existing@example.com", onboarding_prompt_shown_at=datetime.now(timezone.utc)),
        ])
        await db.commit()

    async def claim(email):
        async with sessions() as db:
            user = await db.scalar(select(User).where(User.email == email))
            return await claim_tour_invitation(user, db)

    # Independent sessions represent tabs, repeated logins, and other devices.
    responses = await asyncio.gather(*(claim("new@example.com") for _ in range(8)))
    assert sum(response["show_invitation"] for response in responses) == 1
    assert (await claim("existing@example.com"))["show_invitation"] is False
    assert (await claim("other@example.com"))["show_invitation"] is True
    async with sessions() as db:
        user = await db.scalar(select(User).where(User.email == "manual@example.com"))
        assert user.tutorial_status == "NOT_STARTED"
        await update_tutorial_status(TutorialUpdate(status="IN_PROGRESS"), user, db)
    assert (await claim("manual@example.com"))["show_invitation"] is False
    async with sessions() as db:
        user = await db.scalar(select(User).where(User.email == "new@example.com"))
        original = user.onboarding_prompt_shown_at
        for status in ("SKIPPED", "IN_PROGRESS", "COMPLETED", "IN_PROGRESS"):
            await update_tutorial_status(TutorialUpdate(status=status), user, db)
            await db.refresh(user)
            assert user.tutorial_status == status
            assert user.onboarding_prompt_shown_at == original
            assert (await claim("new@example.com"))["show_invitation"] is False
    await engine.dispose()
