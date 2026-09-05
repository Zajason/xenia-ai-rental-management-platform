"""
Ask-the-AI flow (the concierge answering a guest). Deterministic + offline:
we don't call real LLMs — we inject a fake provider — so we assert the WIRING
(retrieve → provider → reply, guardrails, and graceful degradation), not model
prose quality.
"""
from __future__ import annotations

import asyncio

import app.agent.loop as loop
from app.agent.loop import respond
from app.llm.base import ChatResult, ToolCall
from app.rag.ingest import reindex_unit
from dbutil import cleanup, create_org_unit, requires_db

pytestmark = requires_db


def _ask(org_id, unit_id, message, language="en"):
    return asyncio.run(
        respond(
            org_id=org_id,
            unit_id=unit_id,
            booking_id=None,
            guest_id=None,
            session_id=None,
            message=message,
            language=language,
        )
    )


class _FakeProvider:
    """A stand-in LLM so tests are deterministic and free."""

    name = "fake"

    def __init__(self, text="", tool_calls=None, raises=False):
        self._text = text
        self._calls = tool_calls or []
        self._raises = raises

    def generate(self, *, system, user_message, tools, max_tokens=600):
        if self._raises:
            raise RuntimeError("simulated LLM outage")
        return ChatResult(text=self._text, tool_calls=self._calls)


def test_offline_answers_from_stored_knowledge(monkeypatch):
    """No provider → grounded retrieval-only reply drawn from the indexed chunks."""
    monkeypatch.setattr(loop, "get_chat_provider", lambda: None)
    org_id, unit_id = create_org_unit()
    try:
        asyncio.run(reindex_unit(org_id, unit_id))
        res = _ask(org_id, unit_id, "how do I connect?")
        assert res["reply"]  # non-empty
        # The reply is one of the stored chunks (grounded, not invented).
        assert any(tok in res["reply"] for tok in ("sunset2024", "parking", "Quiet hours"))
    finally:
        cleanup(org_id)


def test_provider_reply_is_used(monkeypatch):
    """With a provider configured, its generated text becomes the reply."""
    monkeypatch.setattr(loop, "get_chat_provider", lambda: _FakeProvider(text="Your wifi password is sunset2024."))
    org_id, unit_id = create_org_unit()
    try:
        asyncio.run(reindex_unit(org_id, unit_id))
        res = _ask(org_id, unit_id, "what is the wifi password?")
        assert res["reply"] == "Your wifi password is sunset2024."
        assert res["escalate"] is False
        assert res["tool_calls"] == []
    finally:
        cleanup(org_id)


def test_provider_tool_call_triggers_escalation(monkeypatch):
    """If the model calls escalate_to_host, the response escalates."""
    fake = _FakeProvider(tool_calls=[ToolCall(name="escalate_to_host", args={"reason": "refund dispute"})])
    monkeypatch.setattr(loop, "get_chat_provider", lambda: fake)
    org_id, unit_id = create_org_unit()
    try:
        asyncio.run(reindex_unit(org_id, unit_id))
        res = _ask(org_id, unit_id, "can you help me with something")
        assert res["escalate"] is True
        assert any(tc["name"] == "escalate_to_host" for tc in res["tool_calls"])
    finally:
        cleanup(org_id)


def test_risky_keyword_escalates_before_calling_the_model(monkeypatch):
    """Money/security/emergency keywords escalate deterministically, pre-model."""
    # Provider that would blow up if called — proves the guardrail short-circuits.
    monkeypatch.setattr(loop, "get_chat_provider", lambda: _FakeProvider(raises=True))
    org_id, unit_id = create_org_unit()
    try:
        asyncio.run(reindex_unit(org_id, unit_id))
        res = _ask(org_id, unit_id, "I want a refund immediately")
        assert res["escalate"] is True
    finally:
        cleanup(org_id)


def test_provider_failure_degrades_to_handoff_not_500(monkeypatch):
    """An LLM outage must become a human handoff, never an error."""
    monkeypatch.setattr(loop, "get_chat_provider", lambda: _FakeProvider(raises=True))
    org_id, unit_id = create_org_unit()
    try:
        asyncio.run(reindex_unit(org_id, unit_id))
        res = _ask(org_id, unit_id, "where do I park")
        assert res["escalate"] is True
        assert res["reply"]  # a friendly 'passed to your host' message
    finally:
        cleanup(org_id)


def test_retrieval_failure_degrades_to_handoff(monkeypatch):
    """If retrieval/embedding fails (e.g. rate limit), degrade — don't crash."""
    async def _boom(*_a, **_k):
        raise RuntimeError("voyage rate limit")

    monkeypatch.setattr(loop, "retrieve", _boom)
    res = _ask("00000000-0000-0000-0000-000000000000", None, "anything")
    assert res["escalate"] is True
    assert res["reply"]
