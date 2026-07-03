"""
Test bootstrap: force the AI service into fully OFFLINE mode so the suite is
hermetic and free — deterministic stub embeddings, no external calls.

We set these as OS env vars, which take precedence over the repo-root .env
(where a placeholder VOYAGE_API_KEY would otherwise trigger a real API call).
Must run before app.config is imported, which conftest guarantees.
"""
import os

os.environ["VOYAGE_API_KEY"] = ""
os.environ["ANTHROPIC_API_KEY"] = ""
os.environ.setdefault("DATABASE_ADMIN_URL", "postgres://xenia:xenia@localhost:5442/xenia")
