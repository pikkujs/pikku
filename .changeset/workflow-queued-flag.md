---
'@pikku/core': patch
'@pikku/inspector': patch
'@pikku/cli': patch
---

refactor(workflow): replace `inline: false` with `workflowQueued: true` on function meta

The per-function workflow dispatch flag has been renamed from the confusing
negative `inline: false` to the explicit positive `workflowQueued: true`.
Two companion fields are also added: `workflowRetries` and `workflowTimeout`
as function-level equivalents of the per-call-site `NodeOptions` fields.

**Breaking change (patch — flag was undocumented):** rename `inline: false`
to `workflowQueued: true` on any `pikkuSessionlessFunc` / `pikkuFunc` that
dispatches its workflow steps via the queue.

**Behaviour change:** a step marked `workflowQueued: true` now throws if no
queue service is configured, instead of silently falling back to inline
execution.

**Bug fix:** `post-process.ts` was registering `wf-step-*` queues for every
workflow step node; it now only registers them for steps that are actually
`workflowQueued: true`, avoiding spurious queue resource allocation.
