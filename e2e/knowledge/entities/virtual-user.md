---
type: entity
title: Virtual user
description: A person the harness signs in as, and the only identity a scenario names
tags: scenarios
---

# Virtual user

A virtual user is **a person**: a name, what they are like, what they are trying to
do, the roles they hold, and one account they sign in with. There is no second
identity behind it.

There used to be two. An _virtual_user_ was one body that signs in and a _virtual_user_ was
the kind of person it was, on the theory that a scenario needing two people of
the same kind — one banning, one banned — needs two of the first and one of the
second. In practice every body here was its own kind, so the second set was a
layer that carried no information and one more place for a name to drift.
`defineVirtualUsers()` is now the only declaration, and `virtualUser` survives only as the
name of a _slot in a scenario step_ — the role a virtual user is cast in for that
step, not a thing that exists on its own.

What each virtual user holds is not written down here. The declaration is the truth —
`tests/scenarios/virtual-users.ts` for who exists and what roles they hold,
`src/roles.ts` for what a role confers, `src/seed-scopes.ts` for what the seed
grants — and a second list would be a copy that drifts the first time a suite
needs one more scope.

Virtual users matter to the knowledge base because scenarios are written in the third
person about them: `Given 'guest' holds the report-viewer role`. Quoting the name
is what keeps a scenario readable without knowing whose session is running it.
