---
type: decision
title: Virtual user sign-in only works for virtual-user-flagged users
description: A virtual user statement mints sessions for user rows flagged virtual user and nothing else, so holding one never impersonates a real user
tags: services
---

# Virtual user sign-in only works for virtual-user-flagged users

A statement or an in-process call signs in only user rows flagged `virtualUser: true`
(see [virtual user sign-in has one door](virtual-user-sign-in-has-one-door.md)). That
could look like a master key, and it deliberately is not one — for two independent
reasons.

The first is the flag. The Better Auth virtual user plugin upserts and signs in only
rows flagged `virtualUser: true`. A statement naming a real customer's address does not
mint that customer's session — it is refused. The flag also flows into the minted
session, so audits and analytics can tell scenario traffic from human traffic.

The second is that a statement names one virtual user: `sub` must be a declared virtual
user, and it expires and is accepted once — see
[an external caller presents one signed statement](an-external-virtual-user-caller-presents-one-signed-statement.md).
A leaked statement opens one synthetic account for a few minutes, not the population.

**What this rules out:** widening the sign-in endpoint to accept any email "so
scenarios can test as a real user", and treating a statement as
equivalent to a session-signing key. It also rules out dropping the `virtualUser` flag
from the minted session — the audit trail's ability to separate synthetic from
real activity depends on it.
