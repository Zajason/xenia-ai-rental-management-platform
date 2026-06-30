# @xenia/event-contracts

The **event catalog**: every domain event that flows on the bus, defined once as
a name + a zod payload. Producers validate before publishing; consumers validate
on receipt. The contract tests in `tests/contract` assert that handlers and this
file never drift.

Convention: events are named `<aggregate>.<past-tense-fact>` and represent facts
that happened, never commands. Add a new event by adding a key to `EVENTS`.
