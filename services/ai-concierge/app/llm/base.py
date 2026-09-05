"""
The chat-provider port. Any LLM (OpenAI, Anthropic, …) implements `generate`
and returns a normalized ChatResult, so the agent loop is provider-agnostic —
the same way locks/payments/channels are ports on the TypeScript side.

`tools` is the canonical tool spec — a list of {name, description, input_schema}
(what tools.tool_specs() returns). Each provider reshapes it to its own format.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Protocol


@dataclass
class ToolCall:
    name: str
    args: dict


@dataclass
class ChatResult:
    text: str
    tool_calls: list[ToolCall] = field(default_factory=list)


class ChatProvider(Protocol):
    name: str

    def generate(
        self,
        *,
        system: str,
        user_message: str,
        tools: list[dict],
        max_tokens: int = 600,
    ) -> ChatResult: ...
