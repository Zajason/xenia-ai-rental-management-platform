# audit

Query surface over the append-only `audit_events` log — every state change and
access event, tenant-scoped, correlatable back to the distributed trace that
produced it. Especially important for a system that unlocks doors.

- **Tables:** audit_events (append-only, partitioned by month).
- **Failure modes:** log loss, tampering, PII leakage (scrub before writing).
