import os
from dotenv import load_dotenv
load_dotenv()

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
    api_key_set = bool(os.getenv("ANTHROPIC_API_KEY"))
    return {
        "status": "ok",
        "api_key_configured": api_key_set,
        "model": os.getenv("MODEL", "claude-sonnet-4-6"),
        "permission_mode": os.getenv("PERMISSION_MODE", "ask"),
    }
