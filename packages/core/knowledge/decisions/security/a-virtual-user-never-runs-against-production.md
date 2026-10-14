---
type: decision
title: A virtual user never runs against production, whatever its disposition
description: startVirtualUserRun and an enabling writeVirtualUserSchedule both refuse with a 403 in production, including for the accountable disposition; an unresolved environment counts as production
tags: core, virtual-users, environments, security
---

# A virtual user never runs against production, whatever its disposition

`refuseInProduction` (`packages/core/src/wirings/virtual-user/virtual-user-scaffold.ts:220`) throws a `ForbiddenError`, "Virtual users do not run against production", whenever the process is a production run. It has no disposition exception: `accountable`, which the persona environment check still accepts in production, is refused here too.

It is called from two places:

- `startVirtualUserRun` (`virtual-user-scaffold.ts:260`), before the run record is created, so a refused run leaves no row.
- `writeVirtualUserSchedule` (`virtual-user-scaffold.ts:438`), only when the row is or becomes enabled. Disabling a schedule, or editing one that is off, is still allowed in production so a leftover schedule can be stopped. A scheduled tick dispatches `runVirtualUser` through `rpc.invoke` (`packages/cli/src/functions/wirings/virtual-user/serialize-virtual-user-functions.ts:575-581`), and that function calls `startVirtualUserRun` (same file, line 348), so a due tick is refused as well.

"Production" is decided by `isProductionRun` (`virtual-user-scaffold.ts:207`). The configured `PIKKU_ENV` environment wins when the project configures environments, and an unresolved environment counts as production. `NODE_ENV` decides only for a project that configures none.

The persona environment rule is separate and unchanged. See [A persona environment is refused unless the environment is known and allowed](a-persona-environment-fails-closed.md): scenarios may still use an `accountable` persona against production, and virtual users may not.

The tests are in `virtual-user-scaffold.test.ts`: "refuses every disposition in production", "the accountable disposition is refused in production too", "an accountable cadence is refused in production too" and "disabling or editing an off cadence is allowed in production".

**What this rules out:** a virtual user, probing or not, acting on real customers' data, and an enabled schedule that can only ever fail to start in production.
