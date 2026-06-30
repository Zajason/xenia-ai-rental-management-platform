# agent

The tool-calling concierge agent.

- `loop.py` — orchestrates retrieve → ground → generate (Claude) → guardrails →
  escalation → memory. Degrades to a retrieval-only answer with no API key so it
  runs offline.
- `tools.py` — the typed tool catalogue. READ tools auto-run; WRITE tools are
  policy-gated (some need host approval) and execute through the core API's
  RBAC + audit path, never the DB directly.

Guardrails: untrusted guest text never triggers a write tool without the gate;
money/security/emergency intents escalate to a human; answers are grounded in
retrieved knowledge and cite the chunks that grounded them (for eval/debugging).
