---
type: decision
title: Starting a virtual-user run or changing a schedule delegates to the scaffold, under its own scope
description: start-virtual-user-run and set-virtual-user-schedule dispatch to the project's scaffolded functions rather than writing rows, and each has a scope separate from reading
tags: console, virtual-users, scopes
---

# Starting a virtual-user run or changing a schedule delegates to the scaffold, under its own scope

Two console functions change what a virtual user does. Neither writes the run or
schedule itself. Both hand the call to the project's scaffolded function, and both
need a scope of their own.

`startVirtualUserRun` (`packages/addon/pikku-console/src/functions/start-virtual-user-run.function.ts`)
looks up the project's `runVirtualUser` in the RPC metadata and reports an error if
it is absent (`start-virtual-user-run.function.ts:26-31`). It then calls
`rpc.exposed('runVirtualUser', input)` (`start-virtual-user-run.function.ts:35`).
Its comment says the virtual user lookup, the acted-upon check and the production guard
are in the scaffolded function, so a second copy would drift
(`start-virtual-user-run.function.ts:6-8`). It is gated by
`pikku:console:virtualUsers:run` (`start-virtual-user-run.function.ts:24`), and the
comment says this is separate from reading "because a run acts as a real user"
(`start-virtual-user-run.function.ts:13-14`).

`setVirtualUserSchedule` (`packages/addon/pikku-console/src/functions/set-virtual-user-schedule.function.ts`)
follows the same shape. It dispatches to the scaffolded `setVirtualUserSchedule`
(`set-virtual-user-schedule.function.ts:34-40`), and the comment says that function
refuses an undeclared virtual user and one declared as acted upon
(`set-virtual-user-schedule.function.ts:6-8`). It is gated by
`pikku:console:virtualUsers:schedule` (`set-virtual-user-schedule.function.ts:32`),
which the comment calls "the most powerful one on this screen", because a schedule
"spends it repeatedly with nobody there" (`set-virtual-user-schedule.function.ts:13-15`).

**What this rules out:** writing a run or schedule row from the console without the
scaffold, and granting run or schedule changes under the read scope.
