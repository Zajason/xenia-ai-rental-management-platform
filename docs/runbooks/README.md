# docs/runbooks

Operational playbooks for 3am moments. Planned:

- **rotate-leaked-access-credential.md** — revoke on the lock, expire the row,
  audit, notify the guest, reissue.
- **resync-drifted-calendar.md** — force a channel sync, diff, resolve conflicts.
- **replay-failed-workflow-run.md** — inspect `run_steps`, run compensation, retry.
- **poison-event.md** — quarantine a bad event off the stream and reprocess.
