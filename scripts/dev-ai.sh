#!/usr/bin/env bash
# Runs the AI concierge service from its venv with reload.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SVC="$ROOT/services/ai-concierge"

if [ ! -d "$SVC/.venv" ]; then
  echo "venv missing — run: pnpm run setup:ai" >&2
  exit 1
fi

cd "$SVC"
exec .venv/bin/uvicorn app.main:app --reload --port "${AI_CONCIERGE_PORT:-8000}"
