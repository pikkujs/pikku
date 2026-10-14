---
type: decision
title: Actor upstream credentials are read from the environment on each sign-in
description: The credentials a synthetic actor carries are taken from ACTOR_CREDENTIAL variables at every sign-in, stored per actor, and removed when the variable is gone
tags: better-auth, actor, credentials
---

# Actor upstream credentials are read from the environment on each sign-in

When `pikkuActor` is given `credentials`, each successful actor sign-in calls
`storeActorCredentials` (`actor-plugin.ts`). For each declared credential name:

- The variable is `ACTOR_CREDENTIAL_<LOCALPART>_<NAME>`, built by
  `actorCredentialEnvKey` from the part of the address before `@` and the credential
  name. Both are uppercased, with non-alphanumerics turned to underscores. For
  example, `dan@actors.local` plus `dolibarr` gives `ACTOR_CREDENTIAL_DAN_DOLIBARR`.
- The value is read from `process.env`, or from the `read` option. A Worker passes
  its variables service.
- **Unset.** The credential is removed with `remove` if one was given, and nothing
  is stored. The stale value does not outlive the variable.
- **Set.** A JSON object is stored as is, anything else as `{ token }`. Malformed
  JSON fails the sign-in with an error that names the variable.

Only the names of the credentials stored are logged.

**What this rules out:** keeping an upstream secret from the environment after the
variable is removed, and putting upstream secrets into the session.
