"""
Chat-provider factory. Returns the configured provider, or None when it isn't
usable (no key, or the SDK isn't installed) — in which case the agent loop
degrades to a retrieval-only answer, so the service always runs offline.

Providers are imported lazily so a missing SDK for the *unused* provider never
breaks startup.
"""
from __future__ import annotations

import logging

from ..config import settings
from .base import ChatProvider, ChatResult, ToolCall

logger = logging.getLogger(__name__)


def get_chat_provider() -> ChatProvider | None:
    provider = settings.llm_provider.lower()

    if provider == "openai":
        if not settings.openai_api_key:
            return None
        try:
            from .openai_provider import OpenAIProvider
        except ImportError:
            logger.warning("LLM_PROVIDER=openai but the `openai` package is not installed")
            return None
        return OpenAIProvider()

    if provider == "anthropic":
        if not settings.anthropic_api_key:
            return None
        try:
            from .anthropic_provider import AnthropicProvider
        except ImportError:
            logger.warning("LLM_PROVIDER=anthropic but the `anthropic` package is not installed")
            return None
        return AnthropicProvider()

    logger.warning("Unknown LLM_PROVIDER=%s — running in offline mode", provider)
    return None


__all__ = ["get_chat_provider", "ChatProvider", "ChatResult", "ToolCall"]
