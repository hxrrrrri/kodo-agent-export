import asyncio
import os
import uuid
from dotenv import load_dotenv
load_dotenv(override=True)

# MCP stdio tool servers require subprocess support, which is unavailable on
# Windows selector loops. Force proactor policy for uvicorn worker processes.
if os.name == "nt" and hasattr(asyncio, "WindowsProactorEventLoopPolicy"):
    asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())

from fastapi import FastAPI
from fastapi import Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from api.bridge import router as bridge_router
from api.chat import router as chat_router
from observability.audit import log_audit_event
from observability.request_context import clear_request_id, set_request_id


def _parse_allowed_origins() -> list[str]:
    raw = os.getenv("ALLOWED_ORIGINS", "").strip()
    if raw:
        origins = [origin.strip() for origin in raw.split(",") if origin.strip()]
        if origins:
            return origins
    return ["http://localhost:5173", "http://localhost:3000"]

app = FastAPI(
    title="KŌDO Agent API",
    description="Personal autonomous AI agent powered by Claude",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_parse_allowed_origins(),
    allow_credentials=True,
    allow_methods=["GET", "POST", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "Accept"],
)

app.include_router(chat_router)
app.include_router(bridge_router)


@app.middleware("http")
async def request_context_middleware(request: Request, call_next):
    request_id = request.headers.get("x-request-id", "").strip() or str(uuid.uuid4())
    request.state.request_id = request_id
    set_request_id(request_id)

    try:
        response = await call_next(request)
    except Exception as e:
        log_audit_event(
            "request_unhandled_error",
            method=request.method,
            path=request.url.path,
            error=str(e),
        )
        response = JSONResponse(status_code=500, content={"detail": "Internal server error"})
    finally:
        clear_request_id()

    response.headers["X-Request-ID"] = request_id
    return response


@app.get("/")
async def root():
    return {"status": "KŌDO Agent running", "version": "1.0.0"}


@app.get("/health")
async def health():
    openai_key_set = bool(os.getenv("OPENAI_API_KEY"))
    anthropic_key_set = bool(os.getenv("ANTHROPIC_API_KEY"))
    configured_model = os.getenv("MODEL", "").strip().lower()
    primary_provider = os.getenv("PRIMARY_PROVIDER", "anthropic").strip().lower()
    if openai_key_set and anthropic_key_set:
        provider = "openai" if primary_provider == "openai" else "anthropic"
    else:
        provider = "openai" if openai_key_set else ("anthropic" if anthropic_key_set else None)
    default_model = "claude-sonnet-4-6" if provider == "anthropic" else "gpt-4o"
    return {
        "status": "ok",
        "api_key_configured": openai_key_set or anthropic_key_set,
        "openai_key_configured": openai_key_set,
        "anthropic_key_configured": anthropic_key_set,
        "api_auth_enabled": bool(os.getenv("API_AUTH_TOKEN", "").strip()),
        "provider": provider,
        "model": os.getenv("MODEL", default_model),
        "permission_mode": os.getenv("PERMISSION_MODE", "ask"),
        "request_id_enabled": True,
        "audit_log_file": str((os.path.expanduser("~/.kodo/audit/events.jsonl"))),
        "usage_log_file": str((os.path.expanduser("~/.kodo/usage/events.jsonl"))),
    }


@app.get("/health/live")
async def health_live():
    return {"status": "ok"}


@app.get("/health/ready")
async def health_ready():
    openai_key_set = bool(os.getenv("OPENAI_API_KEY"))
    anthropic_key_set = bool(os.getenv("ANTHROPIC_API_KEY"))
    has_provider_key = openai_key_set or anthropic_key_set
    return {
        "status": "ok" if has_provider_key else "degraded",
        "ready": has_provider_key,
    }
