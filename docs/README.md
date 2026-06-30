# docs/

Project documentation that is not tied to a single package.

- **architecture/** — the system overview, MVP scope, Architecture Decision
  Records (ADRs), and the event catalog narrative.
- **api/** — generated OpenAPI (REST) and AsyncAPI (events) specs.
- **runbooks/** — operational playbooks (incident response, re-syncing a drifted
  calendar, rotating a leaked access credential, etc.).

If a decision is non-obvious or was contested, it belongs in an ADR. If a 3am
operational action is ever needed, it belongs in a runbook.
