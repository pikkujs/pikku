---
'@pikku/core': patch
---

fix(workflow): back off the stalled-run sweep, and skip runs that cannot move

`sweepUndispatchedSteps` has always consulted a per-run backoff so a genuine
queue backlog is not amplified by a tick that keeps firing at the steps the
backlog is already delaying. `sweepStalledRuns` — its sibling, doing the same
re-drive through the same orchestrator queue — had none, and re-resumed every
stalled run on every tick. A resume does not clear whatever wedged a run, so
the same runs came back on the next tick and the next: in production seven
permanently stuck runs refilled a purged orchestrator queue at seven messages a
minute, and a backlog of six thousand could never drain because each pass added
work the previous pass had not finished. It now takes the same backoff, and
both sweeps share one instance — the record belongs to the re-drive, not to the
signal that asked for it, so a run the relay nudged a moment ago is not nudged
again by the sweep.

`runWorkflowJob` also now returns immediately for a run in a terminal state
instead of taking the run lock and replaying the workflow body. The orchestrator
queue is at-least-once and the relay re-dispatches on purpose, so a message for
a run that already settled is routine — and replaying one could park the body on
a wait that nothing would ever satisfy, holding the run lock, and the pooled
connection under it, until something external gave up. `suspended` is
deliberately not included: it ends a pass, not the run.
