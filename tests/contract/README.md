# tests/contract

Asserts producers and consumers agree with the contracts. Every event a handler
emits/consumes must validate against `@xenia/event-contracts`; every API response
must match the published OpenAPI. These tests fail when the catalog and the code
drift — the guardrail that keeps the modular monolith honestly decoupled.
