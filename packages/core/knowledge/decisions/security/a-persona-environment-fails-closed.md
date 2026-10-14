---
type: decision
title: A persona environment is refused unless the environment is known and allowed
description: Persona provisioning and sign-in refuse when PIKKU_ENV is unresolved, unknown, or production without an explicit production disposition, and production environments are omitted by default
tags: core, personas, environments, security
---

# A persona environment is refused unless the environment is known and allowed

`personaEnvironmentRefusal` (`packages/core/src/wirings/persona/persona-environments.ts`)
fails closed in three cases:

- `PIKKU_ENV` is unresolved;
- `PIKKU_ENV` names an environment the persona config does not know;
- the environment is production and no production disposition is set
  (`PRODUCTION_DISPOSITION`).

`resolvePersonaEnvironments` leaves production environments out by default. A
production persona therefore exists only when someone has chosen it.

**What this rules out:** provisioning or signing in personas when the target
environment is ambiguous, and a production stage that carries personas it was
never meant to have.

This is the persona rule, shared by scenarios and virtual users. Virtual users are
stricter: [A virtual user never runs against production](a-virtual-user-never-runs-against-production.md)
refuses even the production disposition.
