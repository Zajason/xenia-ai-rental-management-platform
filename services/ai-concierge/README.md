# ai-concierge (Python / FastAPI)

The AI layer, separated from the TypeScript monolith because the AI/ML ecosystem
is better in Python and its scaling profile (LLM-latency-bound) differs.

```
app/
  main.py        FastAPI app: /health, /agent/respond, /kb/reindex, /kb/reindex-org
  config.py      settings (models, keys, db url)
  rag/
    ingest.py    WRITE side: facts + docs → chunk → embed → store in kb_chunks
    retriever.py READ side: pgvector search, unit-scoped (+ org-shared)
    embeddings.py Voyage embeddings; deterministic stub when no key
  agent/         the tool-calling agent loop + tool catalogue
  memory/        short-term / per-stay / returning-guest memory
  i18n/          multi-language detection + replies
  eval/          the evaluation harness (groundedness, escalation, tools)
tests/           offline smoke + ingest→retrieve tests (Postgres-gated)
```

### Knowledge base (RAG) ingestion

The owner's knowledge (`property_facts` + `kb_documents`) has to be embedded
into `kb_chunks` before the concierge can retrieve it. That's the ingest
pipeline. It runs on unit setup and on every edit (delete-then-insert =
idempotent), NOT per message.

- The **API** owns the source documents (`/kb/documents` CRUD, in the TS side)
  and triggers reindex on change; adding a `property_fact` also triggers it.
- This service does the work: `POST /kb/reindex {org_id, unit_id}` or
  `POST /kb/reindex-org {org_id}` (build/rebuild the whole org — use after seeding).

```bash
# after `pnpm db:seed`, stock the KB for the demo org:
curl -X POST localhost:8000/kb/reindex-org -H 'content-type: application/json' \
  -d '{"org_id":"<org-uuid>"}'
```

It runs offline with no API keys (stub embeddings + retrieval-only answers), so
the plumbing works before any provider is wired — but stub vectors rank
randomly, so **a real `VOYAGE_API_KEY` is needed for retrieval quality** and
`ANTHROPIC_API_KEY` for generated (vs. retrieval-only) replies. Leave both blank
in `.env` to stay fully offline.

```bash
pnpm run setup:ai        # from repo root: create .venv + install
pnpm run dev:ai          # run with reload on :8000
# or directly:
cd services/ai-concierge && .venv/bin/uvicorn app.main:app --reload --port 8000
```

### Providers (swappable, chosen by env)

Two independent choices, each behind a port (`app/llm/` for chat,
`app/rag/embeddings.py` for embeddings):

| Role | Env | Default | Alternatives |
|------|-----|---------|--------------|
| Chat ("writer") | `LLM_PROVIDER` | `openai` → `gpt-4o-mini` | `anthropic` → `claude-*` |
| Embeddings ("librarian") | `EMBEDDING_PROVIDER` | `voyage` → `voyage-3` | `openai` → `text-embedding-3-small` |

The two are independent — e.g. the default mixes **OpenAI chat + Voyage
embeddings**. Rules: the embedding provider/model MUST match between ingest and
search, and its output dimension must equal `EMBED_DIM` (1024). OpenAI embeddings
are requested with `dimensions=1024` so they drop into the existing column with
no DB change.

Keys live in the repo-root `.env` (loaded by absolute path, so `dev:ai` picks
them up): `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `VOYAGE_API_KEY`. With no key
for the selected chat provider the loop degrades to a retrieval-only answer, so
the service always runs offline.
