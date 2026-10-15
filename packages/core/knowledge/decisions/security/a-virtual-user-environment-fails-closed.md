---
type: decision
title: A virtual user's sign-in is refused unless the environment is known and allowed
description: Virtual user provisioning, sync and sign-in refuse when PIKKU_ENV is unresolved, unknown, production without the accountable disposition, or outside the virtual user's environments, and production environments are omitted by default
tags: core, virtual-users, environments, security
---

# A virtual user's sign-in is refused unless the environment is known and allowed

`virtualUserEnvironmentRefusal`
(`packages/core/src/wirings/virtual-user/virtual-user-environments.ts`) fails
closed when:

- `PIKKU_ENV` is unresolved;
- `PIKKU_ENV` names an environment the config does not know;
- the environment is production and the virtual user's disposition is not
  `PRODUCTION_DISPOSITION` (`accountable`);
- the environment is not one the virtual user may target.

`resolveVirtualUserEnvironments` leaves production environments out when a
virtual user declares no `environments`. A virtual user reaches production only
when someone has named it there. The build-time half is
`virtualUserEnvironmentErrors`, which the doc comment says the inspector runs;
the run-time half is re-checked because "the run check does not trust which
artifact got deployed".

The refusal is applied by `pikku virtual-user sync`
(`packages/cli/src/functions/commands/virtual-user-sync.ts`), by the
`pikku virtual-user` command (`packages/cli/src/functions/commands/virtual-user.ts`)
and by `provisionVirtualUsers`
(`packages/services/better-auth/src/provision-virtual-users.ts`).

**What this rules out:** provisioning or signing in virtual users when the target
environment is ambiguous, and a production stage that carries virtual users it was
never meant to have.

Runs are stricter: [A virtual user never runs against production](a-virtual-user-never-runs-against-production.md)
refuses even the `accountable` disposition.
