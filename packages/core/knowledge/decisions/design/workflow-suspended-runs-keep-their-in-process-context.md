---
type: decision
title: A suspended workflow run keeps its in-process context; only terminal runs release it
description: `suspended` is absent from the terminal set on purpose, and a context is dropped only when nothing is holding it open
tags: workflow
---

# A suspended workflow run keeps its in-process context; only terminal runs release it

`WORKFLOW_TERMINAL_STATES` in `pikku-workflow-service.ts` is
`completed | failed | cancelled`. `suspended` is deliberately absent: a
suspended run stops a poll loop but can still be resumed, so anything the
process holds for it — the run context, an extension's per-run state such as a
scenario's live actor clients — has to survive. `WORKFLOW_END_STATES`, which
`awaitRunEnd` uses to stop reading, does include `suspended`, because a poller
should not wait on a run that needs an external nudge. The two sets are not
interchangeable.

`releaseContext` drops a `RunContext` only when neither `inline` nor `replay`
still holds it open, so an inline run mid-replay is never torn out from under
itself. `updateRunStatus` releases on a terminal status because queued runs
never pass through the inline path that would otherwise do it — without that,
their context would be held for the life of the process. A long-lived server
orchestrates many runs, so anything kept per run has to be released when that
run stops executing here (`workflow-run-context.test.ts`).

**What this rules out:** adding `suspended` to `WORKFLOW_TERMINAL_STATES`,
collapsing the two state sets into one, or making `releaseContext`
unconditional — the first two discard state a resume still needs, the third
frees a context that an in-flight replay is still walking.
