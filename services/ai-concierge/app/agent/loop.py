"""
The agent loop. Orchestrates: retrieve → ground → generate (Claude) with gated
tools → guardrails/escalation → memory update. Degrades gracefully to a
retrieval-only answer when no ANTHROPIC_API_KEY is configured, so the service is
runnable offline for development and demos.
"""
from __future__ import annotations

from ..config import settings
from ..rag.retriever import retrieve
from ..memory.store import load_memory
from .tools import anthropic_tools, requires_approval

try:
    import anthropic  # type: ignore
except ImportError:  # pragma: no cover
    anthropic = None

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
    chunks = await retrieve(org_id, unit_id, message, k=5)
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

    if not (settings.anthropic_api_key and anthropic is not None):
        # Offline fallback: answer from the top chunk.
        reply = chunks[0]["content"] if chunks else _unknown_message(language)
        return {
            "reply": reply,
            "language": language,
            "confidence": round(retrieval_conf, 3),
            "escalate": retrieval_conf < 0.3,
            "tool_calls": [],
        }

    client = anthropic.Anthropic(api_key=settings.anthropic_api_key)
    system = SYSTEM_TEMPLATE.format(language=language, guest_memory=guest_memory, context=context)
    resp = client.messages.create(
        model=settings.anthropic_agent_model,
        max_tokens=600,
        system=system,
        tools=anthropic_tools(),
        messages=[{"role": "user", "content": message}],
    )

    tool_calls = []
    text_parts = []
    for block in resp.content:
        if block.type == "text":
            text_parts.append(block.text)
        elif block.type == "tool_use":
            tool_calls.append(
                {
                    "name": block.name,
                    "args": block.input,
                    "requires_approval": requires_approval(block.name),
                }
            )

    escalate = any(tc["name"] == "escalate_to_host" for tc in tool_calls)
    return {
        "reply": " ".join(text_parts).strip() or _unknown_message(language),
        "language": language,
        "confidence": round(retrieval_conf, 3),
        "escalate": escalate,
        "tool_calls": tool_calls,
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
