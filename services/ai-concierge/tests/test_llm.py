"""Provider-switch wiring: selection logic + tool-spec reshaping (no network)."""
from __future__ import annotations

from app import llm
from app.config import settings
from app.agent.tools import tool_specs
from app.llm.openai_provider import _to_openai_tool


def test_offline_when_no_key(monkeypatch):
    monkeypatch.setattr(settings, "openai_api_key", "")
    monkeypatch.setattr(settings, "anthropic_api_key", "")
    assert llm.get_chat_provider() is None


def test_selects_openai_by_default_when_key_present(monkeypatch):
    monkeypatch.setattr(settings, "llm_provider", "openai")
    monkeypatch.setattr(settings, "openai_api_key", "sk-test-not-real")
    provider = llm.get_chat_provider()
    assert provider is not None and provider.name == "openai"


def test_selects_anthropic_when_configured(monkeypatch):
    monkeypatch.setattr(settings, "llm_provider", "anthropic")
    monkeypatch.setattr(settings, "anthropic_api_key", "sk-ant-test-not-real")
    provider = llm.get_chat_provider()
    assert provider is not None and provider.name == "anthropic"


def test_tool_spec_reshapes_to_openai_function_format():
    spec = tool_specs()[0]
    fn = _to_openai_tool(spec)
    assert fn["type"] == "function"
    assert fn["function"]["name"] == spec["name"]
    assert fn["function"]["parameters"] == spec["input_schema"]
