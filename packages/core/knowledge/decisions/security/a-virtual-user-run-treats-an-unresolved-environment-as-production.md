---
type: decision
title: A virtual-user run treats an unresolved PIKKU_ENV as production
description: The virtual-user scaffold decides "production" from the configured PIKKU_ENV environment, counts an unresolved one as production, and falls back to NODE_ENV only when no environments are configured
tags: core, virtual-users, environments, security
---

# A virtual-user run treats an unresolved PIKKU_ENV as production

`startVirtualUserRun` calls `refuseInProduction` before it creates a run record
(`packages/core/src/wirings/virtual-user/virtual-user-scaffold.ts:232`). `PIKKU_ENV`
is read as the default for `environment` (`virtual-user-scaffold.ts:217`). The
schedule writer runs the same check when the schedule is or becomes enabled
(`virtual-user-scaffold.ts:399`, `:409-411`).

`refuseInProduction` throws a `ForbiddenError` whenever `isProductionRun` is true,
whatever the disposition (`virtual-user-scaffold.ts:192-204`). That rule is
[a virtual user never runs against production](a-virtual-user-never-runs-against-production.md);
this note is about how "production" is decided.

`isProductionRun` decides it as follows (`virtual-user-scaffold.ts:179-188`):

- With no environments configured, it is `NODE_ENV === 'production'` (`:184-186`).
- With environments configured and `PIKKU_ENV` unset, it is true (`:187`,
  `environment ? ... : true`).
- With `PIKKU_ENV` set, it is that environment's `production` flag (`:187`). An
  unknown name evaluates to false in this check. `virtualUserEnvironmentRefusal`
  refuses unknown names at sign-in instead
  (`packages/core/src/wirings/virtual-user/virtual-user-environments.ts:113-119`).

The comment gives the reasons. The configured environment wins over `NODE_ENV`
because a production mirror runs `NODE_ENV=production` too
(`virtual-user-scaffold.ts:166-172`). An unresolved environment counts as
production because nobody can vouch for its data (`:174-177`).

See also [a virtual user's sign-in is refused unless the environment is known and allowed](a-virtual-user-environment-fails-closed.md),
which covers the sign-in refusal in `virtual-user-environments.ts`.

**What this rules out:** starting a run when the environment cannot be named, and
keying the scaffold's refusal on `NODE_ENV` in a project that has configured
environments.
