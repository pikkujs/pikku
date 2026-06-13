---
"@pikku/core": patch
"@pikku/inspector": patch
"@pikku/cli": patch
---

feat(workflow): decide step dispatch purely per-function

Workflow step execution (inline vs queue dispatch) is now decided entirely by
the step's function `inline` flag — the workflow-level / run-level `inline`
meta no longer participates in per-step dispatch.

- Steps default to **inline**, so a normally-started (queue-backed) workflow
  runs its whole chain in one orchestrator pass instead of one queue
  round-trip per step.
- A function marked `inline: false` is dispatched via the queue (its own
  worker, retry isolation). When `inline: false` but no `queueService` is
  configured, the step falls back to inline and emits a `logger.warn` instead
  of silently swallowing the misconfiguration.
- Removed the now-unused workflow-level `inline` from `WorkflowsMeta` /
  `WorkflowRuntimeMeta`, the inspector's workflow extraction, the DSL→graph
  converter, and the deploy analyzer / service inference (which now key off
  the per-function flag). Run-level `inline` is retained: it still controls
  whether a whole run executes in-process without queue infrastructure.
