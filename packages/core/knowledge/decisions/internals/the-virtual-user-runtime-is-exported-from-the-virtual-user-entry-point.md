---
type: decision
title: The virtual user runtime is exported from @pikku/core/virtual-user, never from services
description: Those values reach the virtual-user-conversation and agent runners, which no production server runs — and an unbundled deploy loads whatever the import graph names
tags: core, services
---

# The virtual user runtime lives on `@pikku/core/virtual-user`

`HttpVirtualUser`, `createHttpVirtualUsers`, `readScenarioHttpResponse` and
`postScenarioJson` are exported from `@pikku/core/virtual-user`, not from
`@pikku/core/services`. Their _types_ are re-exported freely — TypeScript erases
those and they cost a bundle nothing.

The values are different. They reach `http-virtual-users`, which reaches the
virtual-user-conversation conversation runner, which reaches the agent runner: an entire
scenario and virtual-user runtime that no production server executes. An
unbundled Node or Lambda deploy does no tree-shaking — it loads whatever the
import graph names — so exporting one value from the services barrel pulls all
of it into every application that imports a service.

This is enforced, not merely intended: `production-barrels-stay-lean.test.ts`
walks the value-import graph from `services/index.ts` and
`wirings/workflow/index.ts` and fails if any of those modules is reachable.

**What this rules out:** re-exporting a virtual user value from the services barrel
for convenience, and "just one small helper" — the graph is transitive, and one
value is enough to pull the whole runtime.
