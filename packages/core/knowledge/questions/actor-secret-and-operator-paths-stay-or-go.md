---
type: question
title: Do the actor secret and the operator path stay or go?
description: Once a key-based run works, the derived actor secret, the actor sign-in call and the Fabric operator path could be deleted; nobody has decided whether they are removed now, later or kept
tags: services, auth
---

# Do the actor secret and the operator path stay or go?

Current code, all still present:
- **Actor sign-in:** `/auth/sign-in/actor`, `ActorSignIn`, the per-persona derived
  secret, and the `SCENARIO_ACTOR_SECRET` lookup. See
  [an actor credential is derived per persona](../decisions/security/an-actor-credential-is-derived-per-persona.md)
  and [actor sign-in only works for actor-flagged users](../decisions/security/actor-sign-in-only-works-for-actor-flagged-users.md).
- **Operator path:** `OperatorSignIn`, `establishOperatorSession`, the
  `x-pikku-impersonate-user-id` header sent with a Fabric token. This is a Fabric
  layer and conflicts with [OSS auth works without Fabric](../decisions/security/oss-auth-works-without-fabric.md).
- **Three places choose between them:** `resolvePersonaCredentials` in the CLI,
  `executeVirtualUserRun` in the scaffold, and `resolvePersonas` in the scenario
  service. The deployed copies disagree on the URL variable and the path default.
- **Playwright** repeats the actor and operator handshakes.

Options, none chosen:
1. Remove them now, in one change.
2. Keep actor sign-in for dev and e2e, and remove only the operator path from OSS.
3. Keep everything until the key-based run is proven, then remove.

The related actor decisions above stay true while the code stays. If they are
removed, those notes need revising.
