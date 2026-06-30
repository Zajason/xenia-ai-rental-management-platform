#!/usr/bin/env bash
# Creates the Python venv for the AI concierge service and installs deps.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SVC="$ROOT/services/ai-concierge"

PY="${PYTHON:-python3.11}"
if ! command -v "$PY" >/dev/null 2>&1; then
  PY="python3"
fi

echo "→ creating venv at $SVC/.venv using $PY ($($PY --version))"
"$PY" -m venv "$SVC/.venv"
"$SVC/.venv/bin/pip" install --upgrade pip >/dev/null
"$SVC/.venv/bin/pip" install -r "$SVC/requirements.txt"

echo "✓ AI concierge venv ready. Run: pnpm run dev:ai"
