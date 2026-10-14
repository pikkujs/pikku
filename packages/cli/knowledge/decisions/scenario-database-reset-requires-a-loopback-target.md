---
type: decision
title: A scenario database reset is refused unless its target is a loopback host
description: The scenario reset replaces database rows, so the CLI refuses it for a production environment or a non-loopback API URL, and the baseline capture refuses a non-loopback MySQL or Postgres connection string
tags: cli, scenarios, database, safety
---

# A scenario database reset is refused unless its target is a loopback host

The scenario reset replaces database rows with seed data. Two checks in the CLI guard it.

- In `scenario run`, with `scenarios.reset.enabled` set, the run refuses an environment marked `production` (`packages/cli/src/functions/commands/scenario.ts:498-500`). It also refuses when `isLocalUrl(env.apiUrl)` is false (`scenario.ts:503-507`).
- In the baseline function in `packages/cli/src/functions/db/scenario-baseline.ts`, the reset refuses when `NODE_ENV` is `production` (`scenario-baseline.ts:77-81`). For a MySQL or Postgres-URL dialect it also refuses when `isLocalUrl` of the connection string is false (`scenario-baseline.ts:89-90`).

`isLocalUrl` is a hostname check against the loopback set (`packages/cli/src/functions/commands/environment.ts:58-71`, the check at `:65-70`).

The baseline code comments that the API URL says nothing about where the database is, because a local server can point at a remote Postgres (`scenario-baseline.ts:82-84`). That is why it checks the connection string rather than only the API URL.

See also [dev seed and db reset refuse NODE_ENV production](dev-seed-and-db-reset-refuse-production-and-outside-paths.md), which covers the separate `pikku db reset` and seed commands.

**What this rules out:** a scenario reset that reaches a remote database through a local API URL, and a reset under `NODE_ENV=production`.
