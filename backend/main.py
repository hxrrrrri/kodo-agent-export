# ruff: noqa: E402

import asyncio
import logging
import os
import uuid
from contextlib import asynccontextmanager

from dotenv import load_dotenv
load_dotenv(override=True)

# MCP stdio tool servers require subprocess support, which is unavailable on
# Windows selector loops. Force proactor policy for uvicorn worker processes.
if os.name == "nt":
    import warnings
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", DeprecationWarning)
        policy_cls = getattr(asyncio, "WindowsProactorEventLoopPolicy", None)
        if policy_cls is not None:
            asyncio.set_event_loop_policy(policy_cls())

from fastapi import FastAPI
from fastapi import Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from api.artifacts import router as artifacts_router
from api.bridge import router as bridge_router
from api.chat import router as chat_router
from api.collab import router as collab_router
from api.cron import router as cron_router
from api.doctor import router as doctor_router
from api.marketplace import router as marketplace_router
from api.prompts import router as prompts_router
from api.krawlx import router as krawlx_router
from api.settings import router as settings_router
from api.security import extract_api_keys_from_header
from api.webhooks import router as webhooks_router
from api.profiles import router as profiles_router
from api.providers import router as providers_router
from api.skills_admin import router as skills_admin_router
from api.tts import router as tts_router
from api.conference import router as conference_router
from api.antivibe import router as antivibe_router
from api.hermes_features import router as hermes_router
from api.cdn_proxy import router as cdn_proxy_router
from api.browser_admin import router as browser_router
from observability.audit import log_audit_event
from observability.request_context import clear_request_id, set_request_id
from providers.smart_router import get_smart_router, smart_router_enabled


logger = logging.getLogger(__name__)


def _parse_allowed_origins() -> list[str]:
    raw = os.getenv("ALLOWED_ORIGINS", "").strip()
    if raw:
        origins = [origin.strip() for origin in raw.split(",") if origin.strip()]
        if origins:
            return origins
    return ["http://localhost:5173", "http://localhost:3000"]


@asynccontextmanager
async def lifespan(app: FastAPI):  # type: ignore[type-arg]
    # Startup
    from api.cron import start_cron_loop
    start_cron_loop()

    yield

    # Shutdown
    if smart_router_enabled():
        try:
            router = await get_smart_router()
            await router.close()
        except Exception as e:
            logger.warning("SmartRouter shutdown warning: %s", e)

    try:
        from api.browser_admin import get_daemon
        daemon = await get_daemon()
        if daemon.is_running:
            await daemon.stop()
    except Exception as e:
        logger.warning("Browser shutdown warning: %s", e)


app = FastAPI(
    title="KODO Agent API",
    description="Personal autonomous AI agent powered by Claude",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_parse_allowed_origins(),
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "Accept", "X-Kodo-Keys", "X-Request-ID"],
)

app.include_router(chat_router)
app.include_router(webhooks_router, prefix="/api")
app.include_router(bridge_router)
app.include_router(providers_router)
app.include_router(doctor_router)
app.include_router(profiles_router)
app.include_router(tts_router)
app.include_router(prompts_router)
app.include_router(krawlx_router)
app.include_router(settings_router, prefix="/api")
app.include_router(marketplace_router, prefix="/api")
app.include_router(skills_admin_router)
app.include_router(collab_router)
app.include_router(cron_router, prefix="/api")
app.include_router(artifacts_router)
app.include_router(conference_router)
app.include_router(antivibe_router)
app.include_router(hermes_router)
app.include_router(cdn_proxy_router)
app.include_router(browser_router, prefix="/api")


@app.middleware("http")
async def request_context_middleware(request: Request, call_next):
    request_id = request.headers.get("x-request-id", "").strip() or str(uuid.uuid4())
    request.state.request_id = request_id
    request.state.api_key_overrides = extract_api_keys_from_header(request)
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
    return {"status": "KODO Agent running", "version": "1.0.0"}


@app.get("/health")
async def health():
    openai_key_set = bool(os.getenv("OPENAI_API_KEY"))
    anthropic_key_set = bool(os.getenv("ANTHROPIC_API_KEY"))
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