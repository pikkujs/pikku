---
'@pikku/core': patch
'@pikku/kysely': patch
'@pikku/mongodb': patch
'@pikku/redis': patch
'@pikku/cloudflare': patch
'@pikku/cli': patch
'@pikku/skills': patch
---

A running workflow step can now be told to stop. `wire.workflowStep.signal` aborts when the run is cancelled, the attempt passes its deadline or the worker loses its lease, and `wire.abortScope.beginChanges()` throws once it has. It is cooperative and does not cross a remote RPC transport. Agent steps and Cloudflare Durable Object workflows get no signal yet.

A queued step delivered to a cancelled or unwinding run no longer runs. A refused first attempt is not compensated; a refused retry is, because an earlier attempt ran. A step that throws after a cancel is not retried.

`workflow.do` of a function takes a per-attempt `timeout` with no default. A retry can run beside the call it replaced, so make side effects idempotent on `workflowStep.invocationId`. Graph and child-workflow steps take no `timeout`, and setting one on Cloudflare is an error. Existing SQL databases need a new `workflow_step.timeout` column: see `docs/MIGRATION.md`.

Redis no longer deletes a child run id saved while it was taking back a lost step.

A cancelled run with nothing to compensate ends `cancelled`, not `failed`.
