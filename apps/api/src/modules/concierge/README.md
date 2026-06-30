# concierge

Thin gateway between the API and the Python AI service (`services/ai-concierge`).
Forwards guest messages for a RAG + tool-calling response, relays tool-call
approvals, and surfaces escalations as host tasks. The AI never touches the DB
directly — it calls back through the same authorized API the agent's tools use.

- **Talks to:** ai-concierge over HTTP; messaging, property, booking, access, tasks.
- **Events consumed:** `message.received`; **emits:** `human.handoff.requested`,
  `agent.action.requested`.
