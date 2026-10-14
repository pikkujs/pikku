---
type: decision
title: A persona's scopes are expanded from its roles once, at run preparation
description: A virtual user's scope set is computed from its declared roles against the defineSystemRole definitions when the run is prepared, and that set is the oracle for scope drift
tags: core, virtual-user, auth
---

# A persona's scopes are expanded from its roles once, at run preparation

`personaScopes` in `packages/core/src/wirings/virtual-user/prepare-virtual-user-run.ts`
expands a persona's `roles` into scopes through the role definitions the seed
grants from. Its doc comment says a persona declares roles and nothing else, and
that the expansion happens "once, here, against the same `defineSystemRole`
definitions the seed grants from", so the catalogue and the seed cannot disagree.

The result feeds two things in `run-virtual-user.ts`. It narrows the catalogue
for a non-adversarial user, and it is the oracle: a call that succeeds on an
endpoint whose `scopes` the persona does not hold is recorded as
`unexpected-success`, which the code calls authorization drift. Using the static
expansion as the truth is what makes that finding mean something, because the
run never asks the target what the persona may do.

**What this rules out:** building a virtual user's catalogue or judging its
successes from a scope list fetched from the live session, which would make the
oracle agree with whatever the target currently grants.
