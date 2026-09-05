"""OpenAI (ChatGPT) chat provider. Default writer — model gpt-4o-mini."""
from __future__ import annotations

import json

from openai import OpenAI

from ..config import settings
from .base import ChatResult, ToolCall


def _to_openai_tool(spec: dict) -> dict:
    """Canonical {name, description, input_schema} → OpenAI function-tool shape."""
    return {
        "type": "function",
        "function": {
            "name": spec["name"],
            "description": spec["description"],
            "parameters": spec["input_schema"],
        },
    }


class OpenAIProvider:
    name = "openai"

    def __init__(self) -> None:
        self._client = OpenAI(api_key=settings.openai_api_key)

    def generate(
        self,
        *,
        system: str,
        user_message: str,
        tools: list[dict],
        max_tokens: int = 600,
    ) -> ChatResult:
        resp = self._client.chat.completions.create(
            model=settings.openai_chat_model,
            max_tokens=max_tokens,
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user_message},
            ],
            tools=[_to_openai_tool(t) for t in tools],
        )
        msg = resp.choices[0].message
        calls: list[ToolCall] = []
        for tc in msg.tool_calls or []:
            try:
                args = json.loads(tc.function.arguments or "{}")
            except json.JSONDecodeError:
                args = {}
            calls.append(ToolCall(name=tc.function.name, args=args))
        return ChatResult(text=msg.content or "", tool_calls=calls)
