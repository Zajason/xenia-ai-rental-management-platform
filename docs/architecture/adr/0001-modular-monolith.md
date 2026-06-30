# ADR 0001 — Modular monolith over microservices (for now)

**Status:** accepted · **Date:** 2026-06-29

## Context
Xenia spans ~14 bounded contexts. A small team (initially one strong developer)
must ship something substantial without drowning in coordination overhead.

## Decision
Build a **modular monolith** (`apps/api`, NestJS) for the domain, with hard module
boundaries: one Nest module per context, one Postgres schema-by-context, and an
explicit event catalog (`@xenia/event-contracts`). Modules communicate via
injected services or the event bus — never cross-context table reads. Extract a
module into its own process only when a real force demands it.

Two extractions are justified from day one:
- **AI concierge** (Python) — different language + LLM-latency scaling profile.
- **Workers** (Node) — different runtime (long-running consumers, schedulers).

## Consequences
- (+) Microservice discipline (boundaries, events) with monolith operability
  (one deploy, local transactions where invariants need them).
- (+) Extraction later is a deploy change, not a rewrite — the seams are real.
- (−) Requires enforcing boundaries by convention/review (no network boundary to
  stop a lazy cross-context import). Mitigated by lint rules + contract tests.

## Alternatives rejected
- **Microservices from day one** — coordination cost kills solo velocity; 14
  half-built services read as cargo-culting.
- **Unstructured monolith** — fast now, unbounded coupling later; no extraction path.
