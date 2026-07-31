---
type: decision
title: Workflow approval expiry is decided from a recorded deadline, not from a timer firing
description: The wake-up job is best-effort liveness; losing, duplicating or delaying it cannot change the gate's answer
tags: workflow
---

# Workflow approval expiry is decided from a recorded deadline, not from a timer firing

On its first reach, `approvalStep` in `pikku-workflow-service.ts` stamps
`expiresAt` into the gate's run-state record and calls `scheduleRunWake`. Every
later replay decides expiry by comparing `Date.now()` against that recorded
deadline. A duplicate, late, or entirely dropped timer therefore all produce the
same answer, and losing the wake costs liveness — the run sits until something
else resumes it — never correctness.

`scheduleRunWake` deliberately enqueues a delayed *orchestrator* pass rather
than reusing `scheduleSleep`. `scheduleSleep` resolves the step it is given,
which for an approval would resolve the gate itself; the wake only nudges the
run to replay and re-evaluate, leaving the gate the sole judge of its own
outcome. It is wrapped in a try/catch that logs and continues, because a
scheduling failure must not fail the run.

An approval returns an `ApprovalOutcome` union (`decided` | `expired`) rather
than throwing on the deadline, so callers are forced to handle expiry and "skip
it and carry on" stays trivial. `decided` means a human answered — whether the
answer was yes or no rides in `data` and is the application's business.

**What this rules out:** treating the timer's delivery as the expiry signal,
routing the wake through `scheduleSleep` or any path that writes the gate's step
result, letting a `scheduleRunWake` failure propagate, or turning expiry into a
thrown error. Expiry also fires unconditionally once enqueued — a durable timer
cannot be retracted — so the replay must no-op it when a decision has already
landed.
