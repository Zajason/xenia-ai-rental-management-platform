# services/

Backend services that run as **separate processes** from the API monolith
because they have a different runtime profile or language.

- **ai-concierge** — Python / FastAPI. Owns the AI layer: RAG over per-unit
  knowledge, the tool-calling agent, returning-guest memory, multi-language
  handling, and the evaluation harness. Separated because the AI/ML ecosystem is
  materially better in Python and its scaling profile (LLM-latency-bound) differs
  from the CRUD API.
- **workers** — TypeScript / BullMQ. The async backbone: the event-driven
  **workflow engine**, the **scheduler** (time-boxed access codes, pre-arrival
  sequences), the **channel sync** jobs, and the **outbox relay** that publishes
  domain events onto the bus.

Everything here is reachable only via HTTP (ai-concierge) or the event bus
(workers). They share types through `@xenia/shared` and the schema through
`@xenia/db`.
