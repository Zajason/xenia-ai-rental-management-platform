"""
Xenia AI Concierge — FastAPI service.

Owns the AI layer: RAG over per-unit knowledge, the tool-calling agent,
returning-guest memory, multi-language handling, and the eval harness. It is just
another authenticated client of the core API — its tools call back through the
same RBAC-checked, audited endpoints a human would, so the AI has no DB backdoor.
"""
from __future__ import annotations

from fastapi import FastAPI
from pydantic import BaseModel

from .config import settings
from .agent.loop import respond
from .i18n.language import detect_language

app = FastAPI(title="Xenia AI Concierge", version="0.0.1")


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "service": "ai-concierge"}


class RespondRequest(BaseModel):
    org_id: str
    unit_id: str | None = None
    booking_id: str | None = None
    guest_id: str | None = None
    session_id: str | None = None
    message: str
    language: str | None = None


class RespondResponse(BaseModel):
    reply: str
    language: str
    confidence: float
    escalate: bool
    tool_calls: list[dict]


@app.post("/agent/respond", response_model=RespondResponse)
async def agent_respond(req: RespondRequest) -> RespondResponse:
    language = req.language or detect_language(req.message)
    result = await respond(
        org_id=req.org_id,
        unit_id=req.unit_id,
        booking_id=req.booking_id,
        guest_id=req.guest_id,
        session_id=req.session_id,
        message=req.message,
        language=language,
    )
    return RespondResponse(**result)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("app.main:app", host="0.0.0.0", port=settings.ai_concierge_port, reload=True)
