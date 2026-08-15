---
type: decision
title: An approval answer outlives the run it answered
description: Run state holds a decision only while the gate is open, so the settled answer carries decidedBy/decidedAt into the step result and every attempt is written to the audit sink, which has no foreign key to the run
tags: workflow, audit
---

# An approval answer outlives the run it answered

An approval gate is asked for so it can be answered for afterwards. "Who
released the funds" is the entire point of four-eyes sign-off, and until this
change none of it was kept.

Run state is where a decision _waits_, not where it is kept. The record under
`workflowRuns.state.__approval_<hex>` is overwritten by the next write to that
key, and cleared outright — `decidedBy: undefined` included — whenever a
decision is refused on replay. A trail that erases exactly the events worth
keeping is not a trail.

So the answer is recorded twice, in two places with different lifetimes.

## The settled decision keeps its provenance

`ApprovalOutcome<T>` carries `decidedBy` and `decidedAt` alongside `data`, so
the answer reaches `workflowStep.result` and, through it,
`workflowStepHistory` — append-only, and already the per-step event log. Both
are spread in only when present, so a gate answered without a session keeps the
shape it had before there was anything to record.

## The audit sink is what survives deletion

`deleteRun` cascades: `workflowStep` is `onDelete('cascade')` from
`workflowRuns`, and `workflowStepHistory` from `workflowStep`. Deleting a run
therefore deletes the sign-off with it — and a _refused_ attempt never reaches a
step at all, so it was never in that trail to begin with.

Every answer — accepted, refused at submission, or cleared on replay — is
written to the `AuditService` as `workflow.approval.decided`, with
`outcome: 'success' | 'denied'`, the decider under `userIdentity.pikkuUserId`,
and the run, reason, scopes and refusal in `metadata`. The `audit` table holds
no foreign key to any workflow table, which is precisely why it is the right
home.

`auditApprovalDecision`
(`packages/core/src/wirings/workflow/workflow-approval-audit.ts`) is a module of
its own rather than a method on `PikkuWorkflowService`: the trail is a separate
concern from running the workflow, and the service is already at the 2000-line
limit `source-files-stay-composable.test.ts` enforces.

**A sink that fails is logged, never thrown.** The trail must not be the reason a
decision is lost. A project with no `audit` service wired records nothing and is
otherwise unaffected — the sink is opt-in, and `auditSchema` is deliberately not
in `pikkuSchemas`.

**What this rules out:** a dedicated `workflowApprovals` table. It would have to
be implemented in all seven backends and would still be deleted with the run
unless it deliberately broke the cascade — at which point it is the audit table
with extra steps. If approvals later need to be _queried_ as a first-class
entity rather than read back from the trail, that is when to revisit.
