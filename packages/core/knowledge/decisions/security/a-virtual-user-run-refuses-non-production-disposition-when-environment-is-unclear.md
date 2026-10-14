---
type: decision
title: A virtual-user run refuses non-production dispositions when PIKKU_ENV is unresolved or production
description: The virtual-user scaffold refuses any disposition other than the production one when PIKKU_ENV is unset or names a production environment, and falls back to NODE_ENV only when no environments are configured
tags: core, virtual-users, environments, security
---

# A virtual-user run refuses non-production dispositions when PIKKU_ENV is unresolved or production

`startVirtualUserRun` checks the effective disposition (the requested one, else the persona's, else `realistic`) with `refuseInProduction` (`packages/core/src/wirings/virtual-user/virtual-user-scaffold.ts:267`). `PIKKU_ENV` is read as the default for `environment` (`virtual-user-scaffold.ts:250`). The schedule writer runs the same check when it enables a schedule (`virtual-user-scaffold.ts:434`, `:445-450`).

`refuseInProduction` throws a `ForbiddenError` when the disposition is not the production one and `isProductionRun` is true (`virtual-user-scaffold.ts:221-236`, the throw at `:232`).

`isProductionRun` decides that as follows (`virtual-user-scaffold.ts:208-217`):

- With no environments configured, it is `NODE_ENV === 'production'` (`:213-214`).
- With environments configured and `PIKKU_ENV` unset, it is true (`:216`, `environment ? ... : true`), so every non-production disposition is refused.
- With `PIKKU_ENV` set, it is that environment's `production` flag (`:216`). An unknown name evaluates to false in this check. `personaEnvironmentRefusal` refuses unknown names at sign-in instead (`packages/core/src/wirings/persona/persona-environments.ts:113-119`).

The comment gives the reasons. The configured environment wins over `NODE_ENV` because a production mirror runs `NODE_ENV=production` too (`virtual-user-scaffold.ts:195-199`). An unresolved environment counts as production because nobody can vouch for its data (`:203-205`).

See also [a-persona-environment-fails-closed.md](a-persona-environment-fails-closed.md), which covers the sign-in refusal in `persona-environments.ts`.

**What this rules out:** running a non-production disposition when the environment cannot be named, and keying the scaffold's refusal on `NODE_ENV` in a project that has configured environments.
