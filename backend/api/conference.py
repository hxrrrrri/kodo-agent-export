"""
Multi-Model Conference — debate endpoint.

Runs the same prompt through multiple providers simultaneously, streams each
participant's response with a source tag, then optionally runs a synthesizer
that reads all responses and produces a best-of-all-worlds answer.

SSE event types emitted:
  participant_start   {participant_id, name, provider, model}
  participant_text    {participant_id, content}
  participant_done    {participant_id}
  synthesis_start     {}
  synthesis_text      {content}
  conference_done     {participant_count}
  conference_error    {participant_id, message}
"""

from __future__ import annotations

import asyncio
import json
import logging
from typing import Any, AsyncIterator

from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from api.security import require_api_auth
from providers.openai_compat import openai_compat_chat
from providers.ollama_provider import list_ollama_models
from providers.smart_router import SmartRouter, build_default_providers

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/conference", tags=["conference"])

_smart_router: SmartRouter | None = None


def _get_router() -> SmartRouter:
    global _smart_router
    if _smart_router is None:
        _smart_router = SmartRouter(providers=build_default_providers())
    return _smart_router


class ConferenceParticipant(BaseModel):
    provider: str
    model: str | None = None
    name: str | None = None


class ConferenceRequest(BaseModel):
    prompt: str = Field(..., min_length=1)
    participants: list[ConferenceParticipant] = Field(..., min_length=2, max_length=6)
    system_prompt: str | None = None
    synthesize: bool = True
    synthesizer_provider: str | None = None
    history: list[dict[str, Any]] = Field(default_factory=list)
    max_tokens: int = 4096


def _sse(data: dict) -> str:
    return f"data: {json.dumps(data)}\n\n"


async def _stream_participant(
    participant_id: int,
    participant: ConferenceParticipant,
    messages: list[dict],
    max_tokens: int,
    queue: asyncio.Queue,
) -> None:
    """Stream one participant's response into the shared queue."""
    sr = _get_router()
    if not sr._initialized:
        await sr.initialize()

    # Find the provider record
    prov = next((p for p in sr.providers if p.name == participant.provider), None)
    if prov is None or not prov.is_configured:
        await queue.put({
            "type": "conference_error",
            "participant_id": participant_id,
            "message": f"Provider '{participant.provider}' not configured or unavailable",
        })
        await queue.put({"type": "participant_done", "participant_id": participant_id})
        return

    model = participant.model or prov.big_model
    name = participant.name or f"{participant.provider}/{model}"

    await queue.put({
        "type": "participant_start",
        "participant_id": participant_id,
        "name": name,
        "provider": participant.provider,
        "model": model,
    })

    full_text = ""
    try:
        extra_headers: dict[str, str] = {}
        if participant.provider == "gemini" and prov.api_key:
            extra_headers["x-goog-api-key"] = prov.api_key

        stream = await openai_compat_chat(
            base_url=prov.base_url,
            api_key=prov.api_key,
            model=model,
            messages=messages,
            stream=True,
            max_tokens=max_tokens,
            extra_headers=extra_headers if extra_headers else None,
        )

        if isinstance(stream, dict):
            # Non-streaming fallback
            content = stream.get("choices", [{}])[0].get("message", {}).get("content", "")
            if content:
                await queue.put({
                    "type": "participant_text",
                    "participant_id": participant_id,
                    "content": content,
                })
                full_text = content
        else:
            async for chunk in stream:  # type: ignore[union-attr]
                if isinstance(chunk, str) and chunk:
                    full_text += chunk
                    await queue.put({
                        "type": "participant_text",
                        "participant_id": participant_id,
                        "content": chunk,
                    })
    except Exception as exc:
        logger.warning("Conference participant %s failed: %s", participant.provider, exc)
        await queue.put({
            "type": "conference_error",
            "participant_id": participant_id,
            "message": str(exc)[:200],
        })

    await queue.put({
        "type": "participant_done",
        "participant_id": participant_id,
        "_full_text": full_text,
    })


async def _stream_synthesis(
    original_prompt: str,
    responses: dict[int, str],
    participants: list[ConferenceParticipant],
    synthesizer_provider: str | None,
    max_tokens: int,
    queue: asyncio.Queue,
) -> None:
    """Run the synthesizer that reads all responses and produces the best answer."""
    sr = _get_router()

    # Pick synthesizer provider
    if synthesizer_provider:
        prov = next((p for p in sr.providers if p.name == synthesizer_provider and p.is_configured), None)
    else:
        prov = next((p for p in sr.providers if p.is_configured), None)

    if prov is None:
        await queue.put({
            "type": "conference_error",
            "participant_id": -1,
            "message": "No configured provider available for synthesis",
        })
        return

    # Build synthesis prompt
    responses_text = "\n\n".join([
        f"=== {participants[i].name or participants[i].provider} ===\n{text}"
        for i, text in responses.items()
        if text.strip()
    ])

    synthesis_messages = [
        {
            "role": "system",
            "content": (
                "You are a synthesis AI. You have received multiple expert responses to the same "
                "question from different AI models. Your job is to:\n"
                "1. Identify the strongest insights from each response\n"
                "2. Resolve any contradictions by picking the most accurate position\n"
                "3. Synthesize a single comprehensive, well-structured answer\n"
                "4. Be explicit about where responses disagreed and which view you chose and why\n"
                "Be concise but thorough. Lead with the synthesized answer."
            ),
        },
        {
            "role": "user",
            "content": (
                f"Original question: {original_prompt}\n\n"
                f"Responses from {len(responses)} models:\n\n{responses_text}\n\n"
                "Synthesize the best possible answer."
            ),
        },
    ]

    await queue.put({"type": "synthesis_start"})

    try:
        extra_headers: dict[str, str] = {}
        if prov.name == "gemini" and prov.api_key:
            extra_headers["x-goog-api-key"] = prov.api_key

        stream = await openai_compat_chat(
            base_url=prov.base_url,
            api_key=prov.api_key,
            model=prov.big_model,
            messages=synthesis_messages,
            stream=True,
            max_tokens=max_tokens,
            extra_headers=extra_headers if extra_headers else None,
        )

        if isinstance(stream, dict):
            content = stream.get("choices", [{}])[0].get("message", {}).get("content", "")
            if content:
                await queue.put({"type": "synthesis_text", "content": content})
        else:
            async for chunk in stream:  # type: ignore[union-attr]
                if isinstance(chunk, str) and chunk:
                    await queue.put({"type": "synthesis_text", "content": chunk})
    except Exception as exc:
        logger.warning("Conference synthesis failed: %s", exc)
        await queue.put({
            "type": "conference_error",
            "participant_id": -1,
            "message": f"Synthesis error: {str(exc)[:200]}",
        })


async def _run_conference(
    body: ConferenceRequest,
) -> AsyncIterator[str]:
    """Core generator: runs all participants, collects results, synthesizes."""
    queue: asyncio.Queue[dict] = asyncio.Queue()

    # Build messages for each participant
    system_content = body.system_prompt or "You are a helpful, knowledgeable assistant. Be thorough and accurate."
    base_messages: list[dict] = [{"role": "system", "content": system_content}]
    base_messages.extend(body.history)
    base_messages.append({"role": "user", "content": body.prompt})

    n = len(body.participants)
    done_count = 0
    participant_texts: dict[int, str] = {}

    # Kick off all participant tasks
    tasks = [
        asyncio.create_task(
            _stream_participant(i, p, base_messages, body.max_tokens, queue)
        )
        for i, p in enumerate(body.participants)
    ]

    # Drain queue until all participants done, then synthesize
    while done_count < n or not queue.empty():
        try:
            event = await asyncio.wait_for(queue.get(), timeout=120.0)
        except asyncio.TimeoutError:
            break

        if event["type"] == "participant_done":
            full_text = event.pop("_full_text", "")
            participant_texts[event["participant_id"]] = full_text
            done_count += 1
            yield _sse(event)
        else:
            yield _sse(event)

        if done_count >= n and queue.empty():
            break

    # Wait for all tasks to complete
    await asyncio.gather(*tasks, return_exceptions=True)

    # Synthesis phase
    if body.synthesize and any(t.strip() for t in participant_texts.values()):
        await _stream_synthesis(
            body.prompt,
            participant_texts,
            body.participants,
            body.synthesizer_provider,
            body.max_tokens,
            queue,
        )
        while not queue.empty():
            event = queue.get_nowait()
            yield _sse(event)

    yield _sse({"type": "conference_done", "participant_count": n})


@router.post("/debate")
async def conference_debate(body: ConferenceRequest, request: Request):
    """Run a multi-model conference debate and stream results as SSE."""
    require_api_auth(request)

    async def generate():
        async for chunk in _run_conference(body):
            yield chunk

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


@router.get("/providers")
async def list_conference_providers(request: Request):
    """List configured providers available for conference mode."""
    require_api_auth(request)
    sr = _get_router()
    if not sr._initialized:
        await sr.initialize()
    return {
        "providers": [
            {
                "name": p.name,
                "configured": p.is_configured,
                "healthy": p.healthy,
                "big_model": p.big_model,
                "small_model": p.small_model,
            }
            for p in sr.providers
        ]
    }


@router.get("/models")
async def list_conference_models(request: Request):
    """Return available models per provider. Ollama models are fetched live."""
    require_api_auth(request)
    sr = _get_router()
    if not sr._initialized:
        await sr.initialize()

    result: dict[str, list[str]] = {}
    for p in sr.providers:
        if not p.is_configured:
            continue
        if p.name in ("ollama", "atomic-chat"):
            # Fetch live models from Ollama
            models = await list_ollama_models()
            result[p.name] = models if models else [p.big_model]
        else:
            # Use configured big + small model (deduplicated)
            models_list = list(dict.fromkeys([p.big_model, p.small_model]))
            result[p.name] = [m for m in models_list if m]

    return {"models": result}
