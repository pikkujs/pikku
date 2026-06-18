---
'@pikku/core': patch
---

fix(workflow): propagate pikkuUserId and session to child workflow wires

When a workflow calls `workflow.do()` on a sub-workflow, the child wire was created
without `pikkuUserId`. This meant that `pikkuFunc` steps inside the child workflow
could not resolve a session — `resolveSession` had nothing to look up, causing
`ForbiddenError` for authenticated steps.

Two fixes:
- `childWire` now copies `pikkuUserId` from the parent RPC service's wire, so remote
  queue workers can re-hydrate the session from the session store.
- `orchestrateWorkflow` now propagates `session` from the parent RPC wire into the
  child workflow's execution wire, so inline execution gets the session directly
  without an extra session-store round-trip.
