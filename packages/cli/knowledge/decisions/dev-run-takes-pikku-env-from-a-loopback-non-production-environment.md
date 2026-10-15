---
type: decision
title: A dev run takes PIKKU_ENV from a loopback, non-production environment or leaves it unset
description: pikku dev fills in PIKKU_ENV only when it is unset, choosing a non-production environment whose apiUrl is loopback and preferring one named local, and returns nothing when none qualifies
tags: cli, dev, environments, virtual-users
---

# A dev run takes PIKKU_ENV from a loopback, non-production environment or leaves it unset

`pikku dev` sets `PIKKU_ENV` only when it is not already set (the `??=` in `packages/cli/src/functions/commands/dev.ts`). The value comes from `resolveDevEnvironmentName` (`packages/cli/src/functions/commands/environment.ts`).

That function keeps environments that are not `production` and whose `apiUrl` hostname is in the loopback set. It prefers an environment named `local` and otherwise takes the first candidate. With no candidate it returns `undefined`.

The loopback set is `localhost`, `127.0.0.1`, `0.0.0.0`, `::1` and `[::1]` (`LOCAL_HOSTNAMES` in `environment.ts`).

When `PIKKU_ENV` stays unset, virtual user sign-in refuses with "no environment is resolved" (`packages/core/src/wirings/virtual-user/virtual-user-environments.ts`). A dev project with no loopback environment therefore does not sign virtual users in silently.

**What this rules out:** a dev run that inherits the name of a production environment, and reading "dev" as meaning any configured environment.
