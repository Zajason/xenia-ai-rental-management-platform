"""
The agent loop. Orchestrates: retrieve → ground → generate (via the configured
LLM provider) with gated tools → guardrails/escalation → memory update. Degrades
gracefully to a retrieval-only answer when no chat provider is configured, so the
service is runnable offline for development and demos.

The chat model is provider-agnostic (see app/llm) — OpenAI (default) or
Anthropic, chosen by LLM_PROVIDER. Embeddings are a separate choice (see
app/rag/embeddings).
"""
from __future__ import annotations

import logging

from ..llm import get_chat_provider
from ..rag.retriever import retrieve
from ..memory.store import load_memory
from .tools import requires_approval, tool_specs

logger = logging.getLogger(__name__)

ESCALATION_HINTS = ("refund", "police", "emergency", "ambulance", "lawsuit", "broken into")

SYSTEM_TEMPLATE = """You are Xenia, the AI concierge for a short-term rental.
Answer ONLY from the provided knowledge. If you don't know, say so and offer to
ask the host — never invent door codes, prices, or policies. Reply in {language}.
Be warm, concise, and practical. For anything involving money, security, or
emergencies, use the escalate_to_host tool instead of answering.

Returning-guest context (may be empty):
{guest_memory}

Knowledge for this unit:
{context}
"""


async def respond(
    *,
    org_id: str,
    unit_id: str | None,
    booking_id: str | None,
    guest_id: str | None,
    session_id: str | None,
    message: str,
    language: str,
) -> dict:
    # Retrieval can fail (embedding provider down / rate-limited). NEVER let that
    # 500 — degrade to a human handoff, same as any other AI failure.
    try:
        chunks = await retrieve(org_id, unit_id, message, k=5)
    except Exception as err:  # noqa: BLE001
        logger.warning("retrieval failed → human handoff: %s", err)
        return _handoff_response(language)

    context = "\n".join(f"- {c['content']}" for c in chunks) or "(no knowledge found)"
    guest_memory = load_memory(guest_id) if guest_id else ""
    retrieval_conf = chunks[0]["score"] if chunks else 0.0

    # Risk-based escalation guardrail (cheap, deterministic, before the model).
    if any(h in message.lower() for h in ESCALATION_HINTS):
        return {
            "reply": _escalation_message(language),
            "language": language,
            "confidence": 1.0,
            "escalate": True,
            "tool_calls": [{"name": "escalate_to_host", "requires_approval": False}],
        }

    provider = get_chat_provider()
    if provider is None:
        # Offline fallback: no chat provider configured → answer from the top chunk.
        reply = chunks[0]["content"] if chunks else _unknown_message(language)
        return {
            "reply": reply,
            "language": language,
            "confidence": round(retrieval_conf, 3),
            "escalate": retrieval_conf < 0.3,
            "tool_calls": [],
        }

    system = SYSTEM_TEMPLATE.format(language=language, guest_memory=guest_memory, context=context)
    # Provider calls can fail (LLM down / rate-limited / bad key) — handoff too.
    try:
        result = provider.generate(system=system, user_message=message, tools=tool_specs())
    except Exception as err:  # noqa: BLE001
        logger.warning("chat provider failed → human handoff: %s", err)
        return _handoff_response(language)

    tool_calls = [
        {"name": c.name, "args": c.args, "requires_approval": requires_approval(c.name)}
        for c in result.tool_calls
    ]
    escalate = any(tc["name"] == "escalate_to_host" for tc in tool_calls)
    return {
        "reply": result.text.strip() or _unknown_message(language),
        "language": language,
        "confidence": round(retrieval_conf, 3),
        "escalate": escalate,
        "tool_calls": tool_calls,
    }


def _handoff_response(language: str) -> dict:
    """Uniform 'passed to a human' result used whenever the AI cannot answer."""
    return {
        "reply": _escalation_message(language),
        "language": language,
        "confidence": 0.0,
        "escalate": True,
        "tool_calls": [{"name": "escalate_to_host", "requires_approval": False}],
    }


def _escalation_message(language: str) -> str:
    msgs = {
        "en": "I've flagged this to your host who will help you right away.",
        "el": "Ενημέρωσα τον οικοδεσπότη σας, θα σας βοηθήσει αμέσως.",
        "fr": "J'ai prévenu votre hôte qui va vous aider tout de suite.",
    }
    return msgs.get(language, msgs["en"])


def _unknown_message(language: str) -> str:
    msgs = {
        "en": "I'm not sure about that — let me check with your host.",
        "el": "Δεν είμαι σίγουρη — να ρωτήσω τον οικοδεσπότη σας.",
        "fr": "Je ne suis pas sûre — je vais demander à votre hôte.",
    }
    return msgs.get(language, msgs["en"])
