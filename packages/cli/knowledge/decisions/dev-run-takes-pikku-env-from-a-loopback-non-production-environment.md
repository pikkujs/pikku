---
type: decision
title: A dev run takes PIKKU_ENV from a loopback, non-production environment or leaves it unset
description: pikku dev fills in PIKKU_ENV only when it is unset, choosing a non-production environment whose apiUrl is loopback and preferring one named local, and returns nothing when none qualifies
tags: cli, dev, environments, personas
---

# A dev run takes PIKKU_ENV from a loopback, non-production environment or leaves it unset

`pikku dev` sets `PIKKU_ENV` only when it is not already set (`packages/cli/src/functions/commands/dev.ts:94-96`, the `??=` at `:94`). The value comes from `resolveDevEnvironmentName` (`packages/cli/src/functions/commands/environment.ts:182-197`).

That function keeps environments that are not `production` and whose `apiUrl` hostname is in the loopback set (`environment.ts:185-193`, the production exclusion at `:186-188`). It prefers an environment named `local` (`:195`) and otherwise takes the first candidate (`:196`). With no candidate it returns `undefined` (`:197`).

The loopback set is `localhost`, `127.0.0.1`, `0.0.0.0`, `::1` and `[::1]` (`environment.ts:50-56`).

When `PIKKU_ENV` stays unset, persona sign-in refuses with "no environment is resolved" (`packages/core/src/wirings/persona/persona-environments.ts:106-111`). A dev project with no loopback environment therefore does not sign personas in silently.

**What this rules out:** a dev run that inherits the name of a production environment, and reading "dev" as meaning any configured environment.
