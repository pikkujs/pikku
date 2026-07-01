---
'@pikku/queue-pg-boss': patch
---

fix(scheduler): prune orphaned recurring-task schedules on start

When a scheduled task is removed from code, its pg-boss schedule row survived and
kept producing jobs into a queue with no registered worker — the jobs piled up as
'created' forever and could flood the queue (thousands of stuck jobs). `start()`
now drops any `pikku-recurring-scheduled-task_*` schedule and queue that is no
longer registered, so task removals self-heal on the next boot.
