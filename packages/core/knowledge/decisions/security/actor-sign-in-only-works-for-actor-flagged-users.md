---
type: decision
title: Actor sign-in only works for actor-flagged users
description: An actor credential mints sessions for user rows flagged actor and nothing else, so holding one never impersonates a real user
tags: services
---

# Actor sign-in only works for actor-flagged users

`HttpPersonasConfig.secret` (`packages/core/src/services/http-personas.ts`) is
what `ActorSignIn.login` presents: it POSTs `{ email, name, secret }` to
`/auth/sign-in/actor` and gets back a session. That looks like a master key, and
it deliberately is not one — for two independent reasons.

The first is the flag. The Better Auth actor plugin on the other end upserts and
signs in only user rows flagged `actor: true`. Presenting a credential with a
real customer's email does not mint that customer's session — it is refused. The
`actor` flag also flows into the minted session, so audits and analytics can tell
scenario traffic from human traffic after the fact.

The second is that a credential is not shared. What is presented is derived from
the root `SCENARIO_ACTOR_SECRET` and the address it signs in as — see
[an actor credential is derived per persona](an-actor-credential-is-derived-per-persona.md) —
so the blast radius of a leaked credential is one synthetic account, not the
synthetic actor population.

**What this rules out:** widening the sign-in endpoint to accept any email "so
scenarios can test as a real user", and treating an actor credential as
equivalent to a session-signing key. It also rules out dropping the `actor` flag
from the minted session — the audit trail's ability to separate synthetic from
real activity depends on it.
