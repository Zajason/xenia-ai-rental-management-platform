# workflow

A thin API surface over the **workflow engine** that actually runs in
`services/workers`: list/define automations, inspect runs and steps, retry. The
engine itself consumes domain events and executes declarative
`on event → if conditions → do actions` workflows with retries and saga
compensation.

- **Tables:** workflows, workflow_runs, run_steps (+ outbox for reliable events).
- **Events:** consumes everything; emits `workflow.run.*`.
- **Failure modes:** partial failure mid-run (compensation), poison events, loops.
