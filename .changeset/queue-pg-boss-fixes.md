---
"@pikku/queue-pg-boss": patch
---

Fix pg-boss queue initialisation: create the queue before registering a worker to avoid a race condition on first startup. Also sanitise scheduler names to meet pg-boss naming constraints.
