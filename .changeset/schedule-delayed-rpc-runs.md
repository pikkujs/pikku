---
'@pikku/schedule': patch
---

**A delayed RPC now actually runs.** `InMemorySchedulerService.scheduleRPC`
dispatched through `runScheduledTask`, which resolves names against the wired
*cron task* registry — a registry no internally scheduled RPC is ever in. Every
such call died as `ScheduledTaskNotFoundError` and was swallowed into a log
line, and the payload captured alongside it was never forwarded. The one that
mattered was `pikkuWorkflowSleeper`: it is what wakes a run from
`workflow.sleep`, so an async workflow containing a sleep stopped at the first
one and stayed `running` forever. It now invokes the RPC with its data, matching
what the BullMQ and pg-boss schedulers already do.
