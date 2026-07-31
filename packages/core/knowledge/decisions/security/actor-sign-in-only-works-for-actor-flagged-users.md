---
type: decision
title: Actor sign-in only works for actor-flagged users
description: The scenario actor secret mints sessions for user rows flagged actor and nothing else, so holding it never impersonates a real user
tags: services
---

# Actor sign-in only works for actor-flagged users

`HttpScenarioActorsConfig.secret`
(`packages/core/src/services/http-scenario-actors.ts`) is a shared impersonation
secret: `HttpScenarioActor.login` POSTs `{ email, name, secret }` to
`/auth/sign-in/actor` and gets back a session. That looks like a master key, and
it deliberately is not one.

The Better Auth actor plugin on the other end upserts and signs in only user rows
flagged `actor: true`. Presenting the secret with a real customer's email does not
mint that customer's session — it is refused. The `actor` flag also flows into the
minted session, so audits and analytics can tell scenario traffic from human
traffic after the fact. The blast radius of a leaked actor secret is therefore the
synthetic actor population, not the user table.

**What this rules out:** widening the sign-in endpoint to accept any email "so
scenarios can test as a real user", and treating the actor secret as equivalent to
a session-signing key. It also rules out dropping the `actor` flag from the minted
session — the audit trail's ability to separate synthetic from real activity
depends on it.
