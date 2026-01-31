---
'@pikku/core': minor
'@pikku/cli': patch
'@pikku/inspector': patch
---

Refactor trigger system and remove precomputed workflow wires index

**@pikku/core:**

- `TriggerMeta` now extends `CommonWireMeta` (consistent with `ScheduledTasksMeta` and `QueueWorkersMeta`)
- Removed runtime `function.meta` mutation from `wireTriggerSource` — source function meta is now generated at build time
- Removed precomputed `workflows.wires` index from state — HTTP and trigger wire lookups now iterate `workflows.meta` directly
- Renamed `startWorkflowByWire` to `startWorkflowByHTTPWire`
- `TriggerService` reads workflow trigger wires from `workflows.meta` instead of the removed index

**@pikku/inspector:**

- `addTrigger` now extracts full `CommonWireMeta` fields (middleware, errors, summary) matching the `addSchedule` pattern
- Added `wireTriggerSource` visitor to generate source function meta at build time

**@pikku/cli:**

- Removed wires index generation from `serializeWorkflowMeta`
