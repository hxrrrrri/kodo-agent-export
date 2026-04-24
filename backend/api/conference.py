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
import time
from typing import Any, AsyncIterator, Literal

from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from api.security import require_api_auth
from memory.manager import memory_manager
from providers.openai_compat import openai_compat_chat
from providers.discovery import list_available_models
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
    session_id: str | None = Field(default=None, max_length=128)
    system_prompt: str | None = None
    synthesize: bool = True
    synthesizer_provider: str | None = None
    history: list[dict[str, Any]] = Field(default_factory=list)
    max_tokens: int = 4096
    mode: Literal["synthesis", "debate"] = "synthesis"
    debate_rounds: int = Field(default=2, ge=1, le=4)


def _sse(data: dict) -> str:
    return f"data: {json.dumps(data)}\n\n"


def _now_ms() -> int:
    return int(time.time() * 1000)


def _text_message(role: str, content: str) -> dict[str, Any]:
    return {
        "role": role,
        "content": [{"type": "text", "text": content}],
        "timestamp": _now_ms(),
    }


async def _persist_conference_session(
    *,
    session_id: str | None,
    prompt: str,
    mode: str,
    participants: list[ConferenceParticipant],
    final_answer: str,
    independent_responses: dict[int, str] | None = None,
    transcript: list[dict[str, Any]] | None = None,
) -> None:
    sid = str(session_id or "").strip()
    if not sid:
        return

    payload = await memory_manager.load_session_payload(sid)
    history = payload.get("messages", []) if isinstance(payload, dict) else []
    if not isinstance(history, list):
        history = []
    metadata = payload.get("metadata", {}) if isinstance(payload, dict) else {}
    if not isinstance(metadata, dict):
        metadata = {}

    participant_names = [_participant_label(participant, index) for index, participant in enumerate(participants)]
    sections = [
        f"# Multi-Model {'Debate' if mode == 'debate' else 'Synthesis'}",
        f"**Models:** {', '.join(participant_names)}",
        "## Final Answer",
        final_answer.strip() or "(no final answer generated)",
    ]

    if independent_responses:
        rows = []
        for index, text in independent_responses.items():
            if not str(text or "").strip() or index < 0 or index >= len(participants):
                continue
            rows.append(f"### {_participant_label(participants[index], index)}\n{text.strip()}")
        if rows:
            sections.extend(["## Independent Responses", "\n\n".join(rows)])

    if transcript:
        rows = []
        for item in transcript:
            text = str(item.get("text", "")).strip()
            if not text:
                continue
            rows.append(f"### Round {item.get('round')} - {item.get('name')}\n{text}")
        if rows:
            sections.extend(["## Debate Transcript", "\n\n".join(rows)])

    user_message = _text_message("user", prompt)
    assistant_message = _text_message("assistant", "\n\n".join(sections))
    assistant_message["usage"] = {
        "input_tokens": 0,
        "output_tokens": 0,
        "model": f"multi-model-{mode}",
    }

    await memory_manager.save_session(
        session_id=sid,
        messages=[*history, user_message, assistant_message],
        metadata={
            **metadata,
            "mode": metadata.get("mode", "execute"),
            "title": metadata.get("title") or prompt.strip()[:80] or "Multi-model session",
        },
    )


def _participant_label(participant: ConferenceParticipant, index: int) -> str:
    if participant.name:
        return participant.name
    if participant.model:
        return f"{participant.provider}/{participant.model}"
    return f"{participant.provider}-{index + 1}"


async def _stream_model_response(
    *,
    participant: ConferenceParticipant,
    messages: list[dict[str, Any]],
    max_tokens: int,
    queue: asyncio.Queue,
    event_type: str,
    participant_id: int,
    turn_id: str | None = None,
) -> str:
    sr = _get_router()
    if not sr._initialized:
        await sr.initialize()

    prov = next((p for p in sr.providers if p.name == participant.provider), None)
    if prov is None or not prov.is_configured:
        raise RuntimeError(f"Provider '{participant.provider}' not configured or unavailable")

    model = participant.model or prov.big_model
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

    full_text = ""
    if isinstance(stream, dict):
        raw_content = stream.get("content", [])
        content = ""
        if isinstance(raw_content, list) and raw_content:
            first = raw_content[0] if isinstance(raw_content[0], dict) else {}
            content = str(first.get("text", "") if isinstance(first, dict) else "")
        if not content:
            content = str(stream.get("choices", [{}])[0].get("message", {}).get("content", ""))
        if isinstance(content, str) and content:
            full_text = content
            event: dict[str, Any] = {
                "type": event_type,
                "participant_id": participant_id,
                "content": content,
            }
            if turn_id:
                event["turn_id"] = turn_id
            await queue.put(event)
        return full_text

    async for chunk in stream:
        if isinstance(chunk, str) and chunk:
            full_text += chunk
            event = {
                "type": event_type,
                "participant_id": participant_id,
                "content": chunk,
            }
            if turn_id:
                event["turn_id"] = turn_id
            await queue.put(event)

    return full_text


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
        full_text = await _stream_model_response(
            participant=participant,
            messages=messages,
            max_tokens=max_tokens,
            queue=queue,
            event_type="participant_text",
            participant_id=participant_id,
        )
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
) -> str:
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
        return ""

    # Build synthesis prompt
    responses_text = "\n\n".join([
        f"=== {participants[i].name or participants[i].provider} ===\n{text}"
        for i, text in responses.items()
        if text.strip()
    ])

    is_debate_transcript = len(participants) == 1 and participants[0].provider == "debate"
    system_prompt = (
        "You are the final moderator of a structured multi-model expert debate. Produce the best consensus answer "
        "that integrates all strong ideas the models converged on. Resolve disagreements explicitly, but do not "
        "average weak answers. For coding tasks, output the agreed architecture, implementation details, edge cases, "
        "and final code or patch guidance when appropriate. Lead with the final answer."
        if is_debate_transcript
        else (
            "You are a synthesis AI. You have received multiple expert responses to the same "
            "question from different AI models. Your job is to:\n"
            "1. Identify the strongest insights from each response\n"
            "2. Resolve any contradictions by picking the most accurate position\n"
            "3. Synthesize a single comprehensive, well-structured answer\n"
            "4. Be explicit about where responses disagreed and which view you chose and why\n"
            "Be concise but thorough. Lead with the synthesized answer."
        )
    )
    user_instruction = (
        "The text below is a live debate transcript ending with consensus checks from each model. "
        "Return only the final consensus answer that all models can accept. Include unresolved caveats only if they "
        "materially affect correctness."
        if is_debate_transcript
        else "Synthesize the best possible answer."
    )

    synthesis_messages = [
        {
            "role": "system",
            "content": system_prompt,
        },
        {
            "role": "user",
            "content": (
                f"Original question: {original_prompt}\n\n"
                f"Responses from {len(responses)} models:\n\n{responses_text}\n\n"
                f"{user_instruction}"
            ),
        },
    ]

    await queue.put({"type": "synthesis_start"})
    full_text = ""

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
            raw_content = stream.get("content", [])
            content = ""
            if isinstance(raw_content, list) and raw_content:
                first = raw_content[0] if isinstance(raw_content[0], dict) else {}
                content = str(first.get("text", "") if isinstance(first, dict) else "")
            if not content:
                content = str(stream.get("choices", [{}])[0].get("message", {}).get("content", ""))
            if content:
                full_text += str(content)
                await queue.put({"type": "synthesis_text", "content": content})
        else:
            async for chunk in stream:  # type: ignore[union-attr]
                if isinstance(chunk, str) and chunk:
                    full_text += chunk
                    await queue.put({"type": "synthesis_text", "content": chunk})
    except Exception as exc:
        logger.warning("Conference synthesis failed: %s", exc)
        await queue.put({
            "type": "conference_error",
            "participant_id": -1,
            "message": f"Synthesis error: {str(exc)[:200]}",
        })
    return full_text


async def _drain_queue(queue: asyncio.Queue) -> AsyncIterator[str]:
    while not queue.empty():
        yield _sse(queue.get_nowait())


async def _run_debate_conference(body: ConferenceRequest) -> AsyncIterator[str]:
    queue: asyncio.Queue[dict] = asyncio.Queue()
    transcript: list[dict[str, Any]] = []
    system_content = body.system_prompt or (
        "You are participating in a structured expert debate. Be rigorous, concise, and responsive "
        "to the other models. Change your position when another answer is stronger."
    )

    for round_index in range(body.debate_rounds):
        previous = "\n\n".join(
            f"=== {_participant_label(body.participants[item['participant_id']], item['participant_id'])} | round {item['round']} ===\n{item['text']}"
            for item in transcript
            if str(item.get("text", "")).strip()
        )

        for participant_id, participant in enumerate(body.participants):
            label = _participant_label(participant, participant_id)
            turn_id = f"r{round_index + 1}-p{participant_id}"
            await queue.put({
                "type": "debate_turn_start",
                "turn_id": turn_id,
                "round": round_index + 1,
                "participant_id": participant_id,
                "name": label,
                "provider": participant.provider,
                "model": participant.model,
            })
            async for event in _drain_queue(queue):
                yield event

            if round_index == 0:
                user_content = (
                    f"Question:\n{body.prompt}\n\n"
                    "Give your independent answer as one expert in a panel. State assumptions, strongest reasoning, "
                    "tradeoffs, and uncertainty. For coding tasks, include architecture/code decisions and risks."
                )
            else:
                user_content = (
                    f"Question:\n{body.prompt}\n\n"
                    f"Debate so far:\n{previous}\n\n"
                    "Discuss this like a human expert panel: directly answer the strongest useful ideas from other "
                    "models, identify what should be adopted, reject weak points with reasons, and update your own "
                    "position. For coding tasks, converge toward the best implementation plan/code shape. "
                    "End with 'Current consensus contribution:' followed by 2-4 bullets."
                )

            try:
                text = await _stream_model_response(
                    participant=participant,
                    messages=[
                        {"role": "system", "content": system_content},
                        *body.history,
                        {"role": "user", "content": user_content},
                    ],
                    max_tokens=max(512, min(body.max_tokens, 2048)),
                    queue=queue,
                    event_type="debate_turn_text",
                    participant_id=participant_id,
                    turn_id=turn_id,
                )
                transcript.append({
                    "round": round_index + 1,
                    "participant_id": participant_id,
                    "name": label,
                    "provider": participant.provider,
                    "text": text,
                })
            except Exception as exc:
                logger.warning("Conference debate turn failed: %s", exc)
                await queue.put({
                    "type": "conference_error",
                    "participant_id": participant_id,
                    "message": str(exc)[:200],
                })
                text = ""

            await queue.put({
                "type": "debate_turn_done",
                "turn_id": turn_id,
                "round": round_index + 1,
                "participant_id": participant_id,
            })
            async for event in _drain_queue(queue):
                yield event

    consensus_source = "\n\n".join(
        f"=== {item['name']} | round {item['round']} ===\n{item['text']}"
        for item in transcript
        if str(item.get("text", "")).strip()
    )

    for participant_id, participant in enumerate(body.participants):
        label = _participant_label(participant, participant_id)
        turn_id = f"consensus-p{participant_id}"
        await queue.put({
            "type": "debate_turn_start",
            "turn_id": turn_id,
            "round": body.debate_rounds + 1,
            "participant_id": participant_id,
            "name": label,
            "provider": participant.provider,
            "model": participant.model,
        })
        async for event in _drain_queue(queue):
            yield event

        try:
            text = await _stream_model_response(
                participant=participant,
                messages=[
                    {"role": "system", "content": system_content},
                    *body.history,
                    {
                        "role": "user",
                        "content": (
                            f"Question:\n{body.prompt}\n\n"
                            f"Full debate so far:\n{consensus_source}\n\n"
                            "Consensus check: decide whether you agree with the emerging answer. If you agree, say "
                            "'AGREED' and list the exact final points/code decisions that must be included. If not, "
                            "state the smallest change needed for agreement. Do not introduce unrelated ideas."
                        ),
                    },
                ],
                max_tokens=max(384, min(body.max_tokens, 1200)),
                queue=queue,
                event_type="debate_turn_text",
                participant_id=participant_id,
                turn_id=turn_id,
            )
            transcript.append({
                "round": body.debate_rounds + 1,
                "participant_id": participant_id,
                "name": f"{label} consensus check",
                "provider": participant.provider,
                "text": text,
            })
        except Exception as exc:
            logger.warning("Conference consensus turn failed: %s", exc)
            await queue.put({
                "type": "conference_error",
                "participant_id": participant_id,
                "message": str(exc)[:200],
            })

        await queue.put({
            "type": "debate_turn_done",
            "turn_id": turn_id,
            "round": body.debate_rounds + 1,
            "participant_id": participant_id,
        })
        async for event in _drain_queue(queue):
            yield event

    transcript_text = "\n\n".join(
        f"=== {item['name']} | round {item['round']} ===\n{item['text']}"
        for item in transcript
        if str(item.get("text", "")).strip()
    )

    final_answer = ""
    if transcript_text.strip():
        final_answer = await _stream_synthesis(
            body.prompt,
            {-1: transcript_text},
            [ConferenceParticipant(provider="debate", model="transcript", name="Full debate transcript")],
            body.synthesizer_provider,
            body.max_tokens,
            queue,
        )
        async for event in _drain_queue(queue):
            yield event

    await _persist_conference_session(
        session_id=body.session_id,
        prompt=body.prompt,
        mode="debate",
        participants=body.participants,
        final_answer=final_answer,
        transcript=transcript,
    )

    yield _sse({"type": "conference_done", "participant_count": len(body.participants), "mode": "debate"})


async def _run_conference(
    body: ConferenceRequest,
) -> AsyncIterator[str]:
    """Core generator: runs all participants, collects results, synthesizes."""
    if body.mode == "debate":
        async for event in _run_debate_conference(body):
            yield event
        return

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
    final_answer = ""
    if body.synthesize and any(t.strip() for t in participant_texts.values()):
        final_answer = await _stream_synthesis(
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

    if not final_answer.strip():
        final_answer = "\n\n".join(
            f"### {_participant_label(body.participants[index], index)}\n{text}"
            for index, text in participant_texts.items()
            if 0 <= index < len(body.participants) and str(text or "").strip()
        )

    await _persist_conference_session(
        session_id=body.session_id,
        prompt=body.prompt,
        mode="synthesis",
        participants=body.participants,
        final_answer=final_answer,
        independent_responses=participant_texts,
    )

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
            models = await list_available_models(p.name)
            result[p.name] = models if models else [p.big_model]
        else:
            # Use configured big + small model (deduplicated)
            models_list = list(dict.fromkeys([p.big_model, p.small_model]))
            result[p.name] = [m for m in models_list if m]

    return {"models": result}
