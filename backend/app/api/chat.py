import asyncio
import json
import math
import time
from collections import OrderedDict, deque

from fastapi import APIRouter, HTTPException, Request
from pydantic import ValidationError

from app.core.config import settings
from app.schemas.chat import ChatRequest, ChatResponse
from app.services.kody_service import answer_chat

router = APIRouter(prefix="/api/chat", tags=["Kody"])
MAX_BODY_BYTES = 24000


class RateLimiter:
    """Bounded per-process IP limit. Deployments must also limit this route at the edge."""

    def __init__(self):
        self.lock = asyncio.Lock()
        self.calls: OrderedDict[str, deque[float]] = OrderedDict()
        self.global_calls: deque[float] = deque()

    async def check(self, client: str) -> None:
        now = time.monotonic()
        async with self.lock:
            while self.global_calls and self.global_calls[0] <= now - 60:
                self.global_calls.popleft()
            if len(self.global_calls) >= settings.KODY_GLOBAL_REQUESTS_PER_MINUTE:
                retry = max(1, math.ceil(60 - (now - self.global_calls[0])))
                raise HTTPException(status_code=429, detail="Kody is receiving too many messages. Please try again shortly.", headers={"Retry-After": str(retry)})
            entries = self.calls.setdefault(client, deque())
            self.calls.move_to_end(client)
            while entries and entries[0] <= now - 60:
                entries.popleft()
            if len(entries) >= settings.KODY_REQUESTS_PER_MINUTE:
                retry = max(1, math.ceil(60 - (now - entries[0])))
                raise HTTPException(
                    status_code=429,
                    detail="Kody is receiving too many messages. Please try again shortly.",
                    headers={"Retry-After": str(retry)},
                )
            entries.append(now)
            self.global_calls.append(now)
            while len(self.calls) > 10000:
                self.calls.popitem(last=False)


limiter = RateLimiter()
concurrency = asyncio.Semaphore(settings.KODY_MAX_CONCURRENT)


async def read_request(request: Request) -> ChatRequest:
    if request.headers.get("content-type", "").split(";")[0].strip().lower() != "application/json":
        raise HTTPException(status_code=415, detail="Send a JSON chat request.")
    length = request.headers.get("content-length")
    if length:
        try:
            if int(length) > MAX_BODY_BYTES:
                raise HTTPException(status_code=413, detail="Chat request is too large.")
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid Content-Length.") from None
    raw = bytearray()
    async for chunk in request.stream():
        raw.extend(chunk)
        if len(raw) > MAX_BODY_BYTES:
            raise HTTPException(status_code=413, detail="Chat request is too large.")
    try:
        data = json.loads(raw)
        return ChatRequest.model_validate(data)
    except (ValueError, ValidationError, UnicodeDecodeError, TypeError):
        raise HTTPException(status_code=422, detail="Invalid chat message or history.") from None


@router.post("", response_model=ChatResponse)
async def chat(request: Request) -> ChatResponse:
    body = await read_request(request)
    if not settings.GEMINI_API_KEY:
        raise HTTPException(status_code=503, detail="Kody is unavailable right now. Please try again later.")
    await limiter.check(request.client.host if request.client else "unknown")
    try:
        await asyncio.wait_for(concurrency.acquire(), timeout=0.1)
    except TimeoutError:
        raise HTTPException(status_code=503, detail="Kody is busy. Please try again shortly.") from None
    try:
        reply = await answer_chat(body.message, body.history)
    except Exception:
        # Provider failures must not leak credentials, configuration, or submitted messages.
        raise HTTPException(status_code=503, detail="Kody could not answer right now. Please try again later.") from None
    finally:
        concurrency.release()
    return ChatResponse(reply=reply)
