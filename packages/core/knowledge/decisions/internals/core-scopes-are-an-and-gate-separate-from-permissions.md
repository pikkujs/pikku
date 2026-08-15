---
type: decision
title: Scopes are an AND gate, separate from permissions
description: Every declared scope must be held, so adding one can only narrow access — permissions OR, and can only widen it
tags: core
---

# Scopes are an AND gate, separate from permissions

`packages/core/src/scopes.ts` implements the scope check that
`runPikkuFunc` performs before permissions. Every entry in a function's `scopes`
must be satisfied by the session's grants — an AND gate — and the check fails
closed: a session without a `scopes` field, or no session at all, satisfies
nothing. An empty `required` is the only thing anything satisfies.

This is deliberately the opposite composition from `permissions`, whose groups OR
together. Because permissions OR, adding a permission group can only _widen_
access; because scopes AND, adding a scope can only _narrow_ it. That is the
whole reason the two are separate mechanisms and separate code paths rather than
one merged authorization step, and it is why a passing global or function
permission must never be allowed to satisfy a scope.

Satisfaction itself is hierarchical, computed by `satisfyingGrants`: a grant
matches when it is the scope itself, a plain ancestor (`admin` covers
`admin:invoices:create`), a wildcard at or above it (`admin:*`, or the bare `*`),
or a wildcard directly beneath it. Narrower never satisfies broader —
`admin:invoices` does not grant `admin`. Core only ever _reads_
`session.scopes`; whoever builds the session populates it (better-auth's
`mapSession` resolving through a `ScopeService`, for instance), and the runner
never fetches. `hasScopes` is the non-throwing counterpart of `verifyScopes`, for
gates that fall back to another check rather than rejecting outright.

**What this rules out:** folding the scope check into `runPermissions` so there
is "one authorization step", or making an OR of scopes so a session holding any
one of them passes. Either turns a narrowing gate into a widening one, which is a
privilege escalation and not a refactor. It also rules out defaulting an absent
`session.scopes` to "all" for convenience, and rules out having core resolve
scopes itself at call time.
