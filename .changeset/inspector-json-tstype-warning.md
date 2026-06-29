---
'@pikku/cli': patch
---

feat(inspector): warn (non-blocking) when a JSON/JSONB column has no concrete tsType

DB codegen typed every JSON/JSONB column as `unknown` unless a `tsType`
annotation was set, silently erasing type-safety at every call site. The
codegen now emits a non-blocking warning (via the existing `warnings[]`
channel) whenever a JSON/JSONB column resolves to `unknown`/`any` — including
when it is only annotated `kind: 'json'`, or explicitly `tsType: 'unknown'`
(allowed but discouraged). The message names the column, the resolved type, and
the exact annotation to add, so it is actionable by a developer or an AI. A
concrete `tsType` (e.g. `TicketSpec`) silences it.
