---
'@pikku/core': patch
'@pikku/inspector': patch
'@pikku/cli': patch
'@pikku/skills': patch
---

feat(workflow): let an approval gate declare who may answer it

`workflow.approval()` gains `approvers` (`'any' | 'owner' | 'not-initiator'`)
and `approverScope`, so a gate can require four-eyes sign-off, restrict itself
to the run's initiator, or require the decider to hold a named scope.

Both are enforced when the workflow replays the gate — the same place, and for
the same reason, the decision payload is validated: the policy is a value on
the workflow, and a decision can be recorded before the run has ever reached
the gate. A decision that fails the policy is discarded and the gate stays
closed. Where the run has already published its policy, the check also runs at
submission time so the caller gets a 403 rather than silence.

An answer is now recorded where it can be answered for later. The settled
decision carries `decidedBy` and `decidedAt` in its `ApprovalOutcome`, so who
signed reaches `workflowStep.result` and `workflowStepHistory` rather than
living only in mutable run state. Every answer — accepted, refused at the door,
or cleared on replay — is also written to the audit sink as
`workflow.approval.decided`, which outlives the run: `deleteRun` cascades to
steps and history, and a refused attempt never reaches a step at all. Projects
with no audit service wired are unaffected.

**This loosens the default.** `approveStep` previously refused anyone but the
run's initiator, unconditionally. A gate that declares no `approvers` now
accepts a decision from anyone the approve entrypoint admits — restore the old
behaviour per-gate with `approvers: 'owner'`, or gate the approve route with
`auth`/`permissions`. Ownership still governs *reads* of a run unchanged.
