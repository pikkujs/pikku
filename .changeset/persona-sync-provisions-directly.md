---
'@pikku/cli': patch
---

`pikku persona sync` provisions accounts through the database, not by signing in

Signing a persona in was what created their account: the actor endpoint upserted
an `actor: true` row on first sign-in and nothing else did, so this command
called `sessionRoles()` for a side effect and used the answer for nothing.

That is now the wrong way round. Creating an actor row is a power the endpoint
only has under `pikku dev`, so a stage whose sign-in is shut — the normal case —
could not be provisioned at all, and one whose sign-in is open would have had to
accept identity minting as the price of running scenarios.

So the row is written here, through the connection this command already holds
and already reads `user` from to find the id its grants key on. Three
consequences worth stating:

- **It needs no `SCENARIO_ACTOR_SECRET`.** Provisioning never touches the API,
  so the command no longer takes the credential it was only ever passing on to a
  sign-in call. A stage can be provisioned before anyone decides whether its
  actor endpoint should open at all.
- **A real user's address is refused**, rather than being granted the persona's
  roles. If a row exists for that address without `actor`, the command stops and
  names the persona, because the alternative is silently handing somebody else's
  account an `admin` grant.
- **App-level `databaseHooks.user.create` do not fire** for persona accounts.
  Nothing in pikku defines one; an app that does should know these rows arrive
  by provisioning rather than by signup, which is what they are.
