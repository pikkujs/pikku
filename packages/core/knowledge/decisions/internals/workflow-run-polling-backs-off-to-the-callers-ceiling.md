---
type: decision
title: Workflow run polling starts short and backs off to the caller's ceiling
description: `pollIntervalMs` is a ceiling, not a cadence, and the wait lives in its own method so the schedule can be asserted without the clock
tags: workflow
---

# Workflow run polling starts short and backs off to the caller's ceiling

`awaitRunEnd` in `pikku-workflow-service.ts` reads a run until it reaches an end
state, starting at `WORKFLOW_POLL_MIN_MS` (10ms) and multiplying by
`WORKFLOW_POLL_FACTOR` (1.6) up to the caller's `maxIntervalMs`. A fixed
interval is wrong at both ends: it makes a workflow that finished in
milliseconds wait out the whole interval anyway, and it keeps reading a
long-running one at full rate for its entire life. Backing off returns quick
runs promptly while a slow run's read cost grows logarithmically rather than
linearly with duration. So `runToCompletion`'s `pollIntervalMs` is a ceiling,
not a cadence.

An inline sub-workflow uses a lower ceiling, `WORKFLOW_CHILD_POLL_MAX_MS`
(500ms), because the parent step is blocked on it: every wait there is added
latency in the middle of a workflow rather than at its edge.

`waitBeforeNextRead` exists as its own method purely so the schedule can be
asserted directly (`workflow-run-polling.test.ts`). Timing a poll loop by the
clock measures the host's scheduler as much as the policy — `setTimeout(40)`
routinely returns late on a loaded CI runner — which makes the obvious test both
slow and flaky.

**What this rules out:** replacing the backoff with a fixed `pollIntervalMs`
sleep, reading `pollIntervalMs` as the first wait, giving child runs the
top-level ceiling, or inlining `waitBeforeNextRead` back into the loop as a bare
`setTimeout`.
