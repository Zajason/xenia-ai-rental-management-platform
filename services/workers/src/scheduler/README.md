# scheduler

Time-driven jobs. `access-scheduler.ts` activates access credentials at check-in
and expires them at checkout (writing access_events on each transition). The same
folder holds the pre-arrival message sequence and the pricing-suggestion sweep.
In production these run as BullMQ repeatable jobs; a reconciliation job repairs
lock drift.
