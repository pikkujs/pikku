---
type: decision
title: A virtual user never runs against production, whatever its disposition
description: startVirtualUserRun and an enabling writeVirtualUserSchedule both refuse with a 403 in production, including for the accountable disposition; an unresolved environment counts as production
tags: core, virtual-users, environments, security
---

# A virtual user never runs against production, whatever its disposition

`refuseInProduction` (`packages/core/src/wirings/virtual-user/virtual-user-scaffold.ts:192`) throws a `ForbiddenError`, "Virtual users do not run against production", whenever the process is a production run. It has no disposition exception: `accountable`, which the virtual user environment check still accepts at sign-in in production, is refused here too.

It is called from two places:

- `startVirtualUserRun` (`virtual-user-scaffold.ts:232`), before the run record is created, so a refused run leaves no row.
- `writeVirtualUserSchedule` (`virtual-user-scaffold.ts:410`), only when the row is or becomes enabled. Disabling a schedule, or editing one that is off, is still allowed in production so a leftover schedule can be stopped. A scheduled tick dispatches `runVirtualUser` through `rpc.invoke` (`packages/cli/src/functions/wirings/virtual-user/serialize-virtual-user-functions.ts:563-566`), and that function calls `startVirtualUserRun` (same file, line 337), so a due tick is refused as well.

"Production" is decided by `isProductionRun` (`virtual-user-scaffold.ts:179`). The configured `PIKKU_ENV` environment wins when the project configures environments, and an unresolved environment counts as production. `NODE_ENV` decides only for a project that configures none.

The sign-in environment rule is separate and unchanged. See [A virtual user's sign-in is refused unless the environment is known and allowed](a-virtual-user-environment-fails-closed.md): signing an `accountable` virtual user in against production is still allowed there, and starting a run is not.

The tests are in `virtual-user-scaffold.test.ts`: "refuses every disposition in production", "the accountable disposition is refused in production too", "an accountable cadence is refused in production too" and "disabling or editing an off cadence is allowed in production".

**What this rules out:** a virtual user, probing or not, acting on real customers' data, and an enabled schedule that can only ever fail to start in production.
