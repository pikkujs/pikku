---
type: decision
title: A run loads its owner's session every time it executes
description: A run stores only pikkuUserId; each execution reloads the session from sessionStore and runs the full checks, so a revoked permission stops the run; with no store it stops with one error
tags: workflow, authorization, session
---

# A run loads its owner's session every time it executes

A workflow run stores the user id that started it and nothing else
([[workflow-queued-steps-rehydrate-their-session-from-the-run-wire]]). Every
time the run executes (the DSL pass, a graph step, a child run, an async
resume) the engine hands the function that id, and `runPikkuFunc` loads the
session from `sessionStore` and runs the full checks against it: `auth`,
scopes, feature flags and permissions. A permission or scope revoked while the
run is in flight refuses its next execution. That costs a session lookup per
execution, which is accepted.

There is no check at the start. A function is responsible for itself: whoever
calls it, `runPikkuFunc` judges `auth`, scopes, permissions and input when it
runs. So a refused start leaves a failed run row, a queued start answers 200
with a run id, and the refusal shows when the run executes. The read route
answers 401 or 403 for a run nobody may read.

There is no fallback for an app with no session store. A run with an owner
whose work needs a session stops with `workflows that need a session require a
sessionStore`. Use a store, for example `@pikku/better-auth`. No stand-in
session is built from the user id.

**What this rules out:** a pre-check made on the workflow's behalf by a route or
by application code, a marker on the run row saying the start was checked,
a child that inherits its parent's checks, and a session built from `userId`
alone.
