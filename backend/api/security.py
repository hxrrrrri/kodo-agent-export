import asyncio
import os
import time
from collections import deque
from typing import Deque

from fastapi import HTTPException, Request
from observability.audit import log_audit_event


class SlidingWindowRateLimiter:
    def __init__(self, max_requests: int, window_seconds: int):
        self.max_requests = max_requests
        self.window_seconds = window_seconds
        self._events: dict[str, Deque[float]] = {}
        self._lock = asyncio.Lock()

    async def check(self, key: str) -> tuple[bool, int]:
        now = time.time()
        async with self._lock:
            bucket = self._events.setdefault(key, deque())

            while bucket and (now - bucket[0]) > self.window_seconds:
                bucket.popleft()

            if len(bucket) >= self.max_requests:
                retry_after = max(1, int(self.window_seconds - (now - bucket[0])) + 1)
                return False, retry_after

            bucket.append(now)
            return True, 0


def get_client_key(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for", "").split(",")[0].strip()
    if forwarded:
        return forwarded
    if request.client and request.client.host:
        return request.client.host
    return "unknown"


def require_api_auth(request: Request) -> None:
    expected = os.getenv("API_AUTH_TOKEN", "").strip()
    if not expected:
        return

    auth_header = request.headers.get("authorization", "").strip()
    if not auth_header:
        log_audit_event(
            "auth_missing_token",
            method=request.method,
            path=request.url.path,
            client=get_client_key(request),
        )
        raise HTTPException(
            status_code=401,
            detail="Missing bearer token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    scheme, _, token = auth_header.partition(" ")
    if scheme.lower() != "bearer" or token.strip() != expected:
        log_audit_event(
            "auth_invalid_token",
            method=request.method,
            path=request.url.path,
            client=get_client_key(request),
        )
        raise HTTPException(
            status_code=401,
            detail="Invalid bearer token",
            headers={"WWW-Authenticate": "Bearer"},
        )


SEND_RATE_LIMITER = SlidingWindowRateLimiter(
    max_requests=max(1, int(os.getenv("RATE_LIMIT_SEND_PER_MINUTE", "30"))),
    window_seconds=60,
)
SESSION_RATE_LIMITER = SlidingWindowRateLimiter(
    max_requests=max(1, int(os.getenv("RATE_LIMIT_SESSION_PER_MINUTE", "20"))),
    window_seconds=60,
)
MEMORY_RATE_LIMITER = SlidingWindowRateLimiter(
    max_requests=max(1, int(os.getenv("RATE_LIMIT_MEMORY_PER_MINUTE", "10"))),
    window_seconds=60,
)
COMMANDS_RATE_LIMITER = SlidingWindowRateLimiter(
    max_requests=max(1, int(os.getenv("RATE_LIMIT_COMMANDS_PER_MINUTE", "120"))),
    window_seconds=60,
)


async def enforce_rate_limit(request: Request, limiter: SlidingWindowRateLimiter, scope: str) -> None:
    key = f"{scope}:{get_client_key(request)}"
    allowed, retry_after = await limiter.check(key)
    if allowed:
        return

    log_audit_event(
        "rate_limit_exceeded",
        method=request.method,
        path=request.url.path,
        scope=scope,
        client=get_client_key(request),
        retry_after=retry_after,
    )

    raise HTTPException(
        status_code=429,
        detail=f"Rate limit exceeded. Retry in {retry_after}s.",
        headers={"Retry-After": str(retry_after)},
    )
