---
type: decision
title: Virtual-user runs and schedules are read from the host's stores, so reading needs no scaffold
description: get-virtual-user-runs, get-virtual-user-run-steps and get-virtual-user-schedules read the host's own run and schedule stores directly, so a project shows its history whether or not scaffold.virtualUser is on
tags: console, virtual-users, stores
---

# Virtual-user runs and schedules are read from the host's stores, so reading needs no scaffold

Three console functions read virtual-user history straight from the host
application's stores, not through the scaffolded RPCs.

`getVirtualUserRuns` (`packages/addon/pikku-console/src/functions/get-virtual-user-runs.function.ts`)
says it reads "off the host's own `virtualUserRunStore` rather than through the
scaffolded RPCs", so the console shows runs "whether or not that project turned
`scaffold.virtualUser` on" (`get-virtual-user-runs.function.ts:6-9`). It calls
`virtualUserRunStore.list` (`get-virtual-user-runs.function.ts:30`).

`getVirtualUserRunSteps` (`packages/addon/pikku-console/src/functions/get-virtual-user-run-steps.function.ts`)
calls `virtualUserRunStore.steps` (`get-virtual-user-run-steps.function.ts:28`) and
returns an empty list when the store is not wired (`:25-27`).

`getVirtualUserSchedules` (`packages/addon/pikku-console/src/functions/get-virtual-user-schedules.function.ts`)
reads `virtualUserScheduleStore.list()` (`get-virtual-user-schedules.function.ts:27`).
Its comment says the reason is the same as for runs, and that "reading a cadence
needs only the store, while changing one needs the scaffold"
(`get-virtual-user-schedules.function.ts:6-11`).

All three are gated by `pikku:console:virtualUsers:read`
(`get-virtual-user-runs.function.ts:25`, `get-virtual-user-run-steps.function.ts:23`,
`get-virtual-user-schedules.function.ts:22`).

**What this rules out:** requiring `scaffold.virtualUser` before a project's run
history or cadences can be shown. Writes are a different case, covered by the
note on [starting runs and changing schedules](virtual-user-writes-delegate-to-the-scaffold-under-their-own-scopes.md).
