---
'@pikku/cli': patch
'@pikku/core': patch
---

Emit queue meta for workflow-only projects, so per-workflow orchestrator queues actually work.

Workflows synthesise their own `wf-orchestrator-*` / `wf-step-*` queue meta during
post-processing, and those entries have no declaring source file. The queue codegen
bailed early on `queueWorkers.files.size === 0`, so a project that uses workflows but
hand-declares no `wireQueueWorker` wrote no queue meta at all — and the generated
bootstrap therefore never imported it.

With `queue.meta` empty at runtime, `getOrchestratorQueueName()` never found a
per-workflow queue and every workflow silently fell back to the single shared
`pikku-workflow-orchestrator` queue. Nothing failed, but the isolation was gone: one
long-running workflow step head-of-line-blocked every other workflow queued behind it.

The codegen now gates on the meta alone. `@pikku/core` additionally warns at wiring
time when workflows are registered but no per-workflow orchestrator queue is present,
so this degradation can't recur silently.
