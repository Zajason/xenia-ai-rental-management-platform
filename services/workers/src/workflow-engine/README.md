# workflow-engine

The conductor. Consumes domain events off the bus, matches them to enabled
`workflows`, and executes their steps with per-step status, retries, and saga
compensation. Actions are looked up from a registry by name (e.g.
`tasks.createCleaning`, `access.issueCredential`), so workflow definitions stay
declarative data in the DB. The seed installs the canonical
`booking.confirmed → cleaning + access + pre-arrival` workflow.
