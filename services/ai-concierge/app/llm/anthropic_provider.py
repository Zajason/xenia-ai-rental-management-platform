"""Anthropic (Claude) chat provider. Used when LLM_PROVIDER=anthropic."""
from __future__ import annotations

import anthropic

from ..config import settings
from .base import ChatResult, ToolCall


class AnthropicProvider:
    name = "anthropic"

    def __init__(self) -> None:
        self._client = anthropic.Anthropic(api_key=settings.anthropic_api_key)

    def generate(
        self,
        *,
        system: str,
        user_message: str,
        tools: list[dict],
        max_tokens: int = 600,
    ) -> ChatResult:
        # The canonical tool spec IS Anthropic's tool shape, so pass it straight.
        resp = self._client.messages.create(
            model=settings.anthropic_agent_model,
            max_tokens=max_tokens,
            system=system,
            tools=tools,
            messages=[{"role": "user", "content": user_message}],
        )
        text_parts: list[str] = []
        calls: list[ToolCall] = []
        for block in resp.content:
            if block.type == "text":
                text_parts.append(block.text)
            elif block.type == "tool_use":
                calls.append(ToolCall(name=block.name, args=dict(block.input)))
        return ChatResult(text=" ".join(text_parts), tool_calls=calls)
