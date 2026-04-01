import os
from dotenv import load_dotenv
load_dotenv(override=True)

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from api.chat import router as chat_router

app = FastAPI(
    title="KŌDO Agent API",
    description="Personal autonomous AI agent powered by Claude",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(chat_router)


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
        "provider": provider,
        "model": os.getenv("MODEL", default_model),
        "permission_mode": os.getenv("PERMISSION_MODE", "ask"),
    }
