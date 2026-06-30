"""Service configuration, loaded from the environment / repo-root .env."""
from __future__ import annotations

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # The app role is fine for the AI service — RLS keeps it tenant-scoped.
    database_url: str = "postgres://xenia_app:xenia_app@localhost:5442/xenia"
    ai_concierge_port: int = 8000

    anthropic_api_key: str = ""
    # Opus for the agent's reasoning + tool use; Haiku for cheap, high-volume
    # routine replies and classification.
    anthropic_agent_model: str = "claude-opus-4-8"
    anthropic_fast_model: str = "claude-haiku-4-5-20251001"

    voyage_api_key: str = ""
    voyage_embed_model: str = "voyage-3"
    embed_dim: int = 1024

    otel_exporter_otlp_endpoint: str | None = None


settings = Settings()
