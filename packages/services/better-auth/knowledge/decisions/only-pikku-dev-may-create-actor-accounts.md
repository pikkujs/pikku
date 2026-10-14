---
type: decision
title: Only pikku dev may create actor accounts
description: A deployed stage that opens actor sign-in can sign in only as personas already provisioned there, because minting a new actor row is allowed only under pikku dev
tags: better-auth, actor, sign-in, personas
---

# Only pikku dev may create actor accounts

`resolveActorSignIn` returns a `mayProvision` flag, true only when
`PIKKU_DEV_ACTOR_SIGN_IN` is `true`. The doc comment on the field says "a stage that
runs scenarios signs in as the personas the deployment provisioned when it started,
and never mints new identities."

In `pikkuActor`'s `signIn`:

- **No row, no provisioning.** An unknown address with `mayProvision` false is
  refused with `ACTOR_NOT_PROVISIONED_MESSAGE`, which tells the operator to check
  the declaration.
- **Real users are refused.** An existing non-actor row is refused as "User is not
  an actor," whatever the gate says.
- **New rows are actor rows.** Created with `actor: true` and `emailVerified: true`,
  and the `actor` flag flows into the session.

The stage's persona switcher has its own check, `devSwitcherOn`
(`dev-actors.ts`). It is on when the gate is enabled and either `mayProvision` is
true or the `devSwitcher` feature flag is on. A deployed stage therefore needs both
the opt-in and the flag. That check is also what `personaAllowed` uses for the
persona listing and sign-in endpoints in `actor-plugin.ts`.

**What this rules out:** creating identities on a deployed stage through the actor
endpoint, and sign-in creating or altering real users.
