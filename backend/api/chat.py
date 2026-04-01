import json
import uuid
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from agent.loop import AgentLoop
from memory.manager import memory_manager

router = APIRouter(prefix="/api/chat", tags=["chat"])


class ChatRequest(BaseModel):
    message: str
    session_id: str | None = None
    project_dir: str | None = None


class NewSessionResponse(BaseModel):
    session_id: str


@router.post("/send")
async def send_message(req: ChatRequest):
    """Send a message and stream back the agent response via SSE."""
    session_id = req.session_id or str(uuid.uuid4())

    # Load existing history
    history = await memory_manager.load_session(session_id)

    async def event_stream():
        new_messages = list(history)
        new_messages.append({"role": "user", "content": req.message})
        assistant_parts = []
        tool_result_buffer = []

        try:
            agent = AgentLoop(session_id=session_id, project_dir=req.project_dir)
        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"
            return

        try:
            async for event in agent.run(req.message, history):
                # Collect for history saving
                if event["type"] == "text":
                    assistant_parts.append(event["content"])
                elif event["type"] == "tool_result":
                    tool_result_buffer.append(event)

                # Stream event to client
                yield f"data: {json.dumps(event)}\n\n"

                if event["type"] == "done":
                    # Save updated session
                    full_assistant_text = "".join(assistant_parts)
                    updated_history = list(history) + [
                        {"role": "user", "content": req.message},
                        {"role": "assistant", "content": full_assistant_text},
                    ]

                    # Generate title from first message if new session
                    title = req.message[:60] + ("..." if len(req.message) > 60 else "")
                    await memory_manager.save_session(
                        session_id,
                        updated_history,
                        metadata={"title": title},
                    )

        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Session-ID": session_id,
        },
    )


@router.post("/new-session", response_model=NewSessionResponse)
async def new_session():
    session_id = str(uuid.uuid4())
    return NewSessionResponse(session_id=session_id)


@router.get("/sessions")
async def list_sessions():
    sessions = await memory_manager.list_sessions()
    return {"sessions": sessions}


@router.get("/sessions/{session_id}")
async def get_session(session_id: str):
    messages = await memory_manager.load_session(session_id)
    if not messages:
        raise HTTPException(status_code=404, detail="Session not found")
    return {"session_id": session_id, "messages": messages}


@router.delete("/sessions/{session_id}")
async def delete_session(session_id: str):
    deleted = await memory_manager.delete_session(session_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Session not found")
    return {"deleted": True}


@router.post("/memory/append")
async def append_memory(body: dict):
    content = body.get("content", "")
    if not content:
        raise HTTPException(status_code=400, detail="content is required")
    await memory_manager.append_to_memory(content)
    return {"saved": True}
