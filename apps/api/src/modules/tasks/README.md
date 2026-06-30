# tasks

Generates, assigns, and tracks operational tasks (cleanings, inspections) and the
cleaner workflow (offer → accept → checklist → before/after photos → complete →
unit ready). Depends on booking/calendar (timing), notification, property.

- **Tables:** staff, staff_availability, tasks, task_assignments, checklists,
  task_photos.
- **Events:** `task.created`, `task.accepted`, `task.completed`, `unit.ready`.
- **Failure modes:** double-assignment, cleaner no-show, same-day turnover crunch.
