---
type: decision
title: A checked start proves the owner of a run when there is no session store
description: A queued run has no session of its own, so the start records that it judged the real session; only core can set that marker, and it acts only when no sessionStore is configured
tags: workflow, authorization, session
---

# A checked start proves the owner of a run when there is no session store

A queued run reloads its session from `sessionStore` by `pikkuUserId`
([[workflow-queued-steps-rehydrate-their-session-from-the-run-wire]]). With no store,
an `auth: true` workflow refused every signed-in user. Storing the session on the
run row would fix that and put session data in the database.

`checkWorkflowStart` judged the real session at the request, so the run only needs
to know that happened. It returns a wire carrying a module-private symbol, and
`createRun`, the single write door, turns it into `wire.verified: 'start'` and drops
any `verified` it was handed. A child of a proven run gets `'parent'`.

A symbol is what makes this unspoofable. JSON has no symbols, so nothing arriving as
data can carry it. No caller can name it, because it is not exported. `createRun`
also needs the proof to name that workflow and the run to have an owner.

With no store, a proven run gets `session` as `{ userId }`:

- `'start'` skips the body's auth, scopes, feature flag and permissions, which the
  start judged. Input validation still runs.
- Steps and `'parent'` children run their own checks against `{ userId }`, so a scope
  or a field-reading permission refuses. That is the safe side.

With a store configured the marker does nothing, so a session that has gone from the
store stays refused. A split deploy whose start unit lacks the function can only
judge `auth`, so it sets no marker and the run judges itself.

**What this rules out:** a string flag a caller could send; storing the session on
the run; treating a function's own `rpc.startWorkflow` as checked, since nothing
core can see proves what that function judged.
