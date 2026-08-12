---
type: decision
title: A workflow run is read by its owner, and answered by whoever its gate declares
description: A run started through a session records that user and only that user may read it; who may answer an approval gate is the gate's own declaration, and a run with no recorded owner has no ownership to enforce
tags: workflow
---

# A workflow run is read by its owner, and answered by whoever its gate declares

`WorkflowRunWire.pikkuUserId` has always been recorded on every run started
through a session — `RPCService.startWorkflow` copies it off the wire — and
nothing read it back. Run ids were the only secret protecting both the status
routes (which stream `output` and `error`) and `approveStep`, which took no
session at all and rejected only an already-resolved gate.

`assertWorkflowRunOwner`
(`packages/core/src/wirings/workflow/workflow-run-ownership.ts`) is the check the
**read** paths share: the generated status routes assert it against the run they
were already reading.

**A run with no recorded owner is not gated.** Triggers, schedulers and routes
wired without auth start runs with no `pikkuUserId`; there is nobody to compare a
caller against, and inventing one would reject the framework's own callers rather
than secure anything. Gate those at the entrypoint with `auth` or `permissions`.

This is ownership, not an approver model. It answers "is this your run", not "are
you entitled to approve this particular gate".

## Approving is a separate question, and the gate answers it

`approveStep` originally shared `assertWorkflowRunOwner`, which made "only the
initiator may answer" the one available rule. That is right for "confirm your own
action" and exactly wrong for four-eyes sign-off, where the initiator is the one
person who must not sign. Which applies is a property of the decision, so it is
declared on the gate — `approvers` (`'any' | 'owner' | 'not-initiator'`) and
`approverScope` on `WorkflowApprovalOptions` — and enforced on replay alongside
payload validation, because the policy is a value on the workflow and a decision
can legitimately be recorded before the run has reached the gate.

The default is therefore `any`: a gate is a pause for a decision, not an
authorization boundary, and a route that needs one has `auth`/`permissions`.

**What this rules out:** treating a run id as a capability, adding a new run read
path that does not take a session, and re-deriving who may approve from who
started the run.
