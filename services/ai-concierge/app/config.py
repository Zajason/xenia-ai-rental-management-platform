"""Service configuration, loaded from the environment / repo-root .env."""
from __future__ import annotations

from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

# The repo-root .env, resolved absolutely so it loads no matter the cwd the
# service is started from (dev-ai.sh runs from services/ai-concierge/). OS env
# vars still take precedence over the file (so tests can force offline mode).
_ROOT_ENV = Path(__file__).resolve().parents[3] / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=str(_ROOT_ENV), extra="ignore")

    # The app role is fine for the AI service — RLS keeps it tenant-scoped.
    database_url: str = "postgres://xenia_app:xenia_app@localhost:5442/xenia"
    ai_concierge_port: int = 8000

    # --- Chat / generation provider (the "writer") ---
    # Which LLM writes the reply. Independent of the embedding provider below.
    llm_provider: str = "openai"  # "openai" | "anthropic"

    openai_api_key: str = ""
    openai_chat_model: str = "gpt-4o-mini"

    anthropic_api_key: str = ""
    # Opus for deep reasoning/tool use; Haiku for cheap high-volume replies.
    anthropic_agent_model: str = "claude-opus-4-8"
    anthropic_fast_model: str = "claude-haiku-4-5-20251001"

    # --- Embedding provider (the "librarian") ---
    # Which model turns knowledge into vectors. MUST stay consistent between
    # ingesting and searching, and its output dim must equal embed_dim / the
    # kb_chunks.embedding column width.
    embedding_provider: str = "voyage"  # "voyage" | "openai"

    voyage_embed_model: str = "voyage-3"
    voyage_api_key: str = ""

    openai_embed_model: str = "text-embedding-3-small"  # supports dimensions=1024

    embed_dim: int = 1024

    otel_exporter_otlp_endpoint: str | None = None


settings = Settings()
