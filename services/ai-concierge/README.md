# ai-concierge (Python / FastAPI)

The AI layer, separated from the TypeScript monolith because the AI/ML ecosystem
is better in Python and its scaling profile (LLM-latency-bound) differs.

```
app/
  main.py        FastAPI app: /health, POST /agent/respond
  config.py      settings (models, keys, db url)
  rag/           pgvector retrieval + Voyage embeddings (unit-scoped)
  agent/         the tool-calling agent loop + tool catalogue
  memory/        short-term / per-stay / returning-guest memory
  i18n/          multi-language detection + replies
  eval/          the evaluation harness (groundedness, escalation, tools)
tests/           offline smoke tests (no keys needed)
```

It runs offline with no API keys (stub embeddings + retrieval-only answers), so
the demo works before any provider is wired.

```bash
pnpm run setup:ai        # from repo root: create .venv + install
pnpm run dev:ai          # run with reload on :8000
# or directly:
cd services/ai-concierge && .venv/bin/uvicorn app.main:app --reload --port 8000
```

Models (config-driven): agent = `claude-opus-4-8`, fast/classify =
`claude-haiku-4-5-20251001`. Embeddings = Voyage `voyage-3`.
