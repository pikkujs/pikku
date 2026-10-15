---
type: decision
title: Virtual user sign-in only works for virtual-user-flagged users
description: A virtual user credential mints sessions for user rows flagged virtual user and nothing else, so holding one never impersonates a real user
tags: services
---

# Virtual user sign-in only works for virtual-user-flagged users

`HttpVirtualUsersConfig.secret` (`packages/core/src/services/http-virtual-users.ts`) is
what `VirtualUserSecretSignIn.login` presents: it POSTs `{ email, name, secret }` to
`/auth/sign-in/virtual-user` and gets back a session. That looks like a master key, and
it deliberately is not one — for two independent reasons.

The first is the flag. The Better Auth virtual user plugin on the other end upserts and
signs in only user rows flagged `virtualUser: true`. Presenting a credential with a
real customer's email does not mint that customer's session — it is refused. The
`virtualUser` flag also flows into the minted session, so audits and analytics can tell
scenario traffic from human traffic after the fact.

The second is that a credential is not shared. What is presented is derived from
the root `SCENARIO_VIRTUAL_USER_SECRET` and the address it signs in as — see
[a virtual user credential is derived per virtual user](a-credential-is-derived-per-virtual-user.md) —
so the blast radius of a leaked credential is one synthetic account, not the
synthetic virtual user population.

**What this rules out:** widening the sign-in endpoint to accept any email "so
scenarios can test as a real user", and treating a virtual user credential as
equivalent to a session-signing key. It also rules out dropping the `virtualUser` flag
from the minted session — the audit trail's ability to separate synthetic from
real activity depends on it.
