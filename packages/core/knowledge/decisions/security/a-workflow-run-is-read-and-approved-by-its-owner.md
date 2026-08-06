---
type: decision
title: A workflow run is read and approved by its owner
description: A run started through a session records that user and only that user may read it or answer its approval gates; a run with no recorded owner has no ownership to enforce
tags: workflow
---

# A workflow run is read and approved by its owner

`WorkflowRunWire.pikkuUserId` has always been recorded on every run started
through a session — `RPCService.startWorkflow` copies it off the wire — and
nothing read it back. Run ids were the only secret protecting both the status
routes (which stream `output` and `error`) and `approveStep`, which took no
session at all and rejected only an already-resolved gate.

`assertWorkflowRunOwner`
(`packages/core/src/wirings/workflow/workflow-run-ownership.ts`) is the one check
both paths share. `approveStep` takes the caller's session and asserts it, and
the generated status routes assert it against the run they were already reading.

**A run with no recorded owner is not gated.** Triggers, schedulers and routes
wired without auth start runs with no `pikkuUserId`; there is nobody to compare a
caller against, and inventing one would reject the framework's own callers rather
than secure anything. Gate those at the entrypoint with `auth` or `permissions`.

This is ownership, not an approver model. It answers "is this your run", not "are
you entitled to approve this particular gate" — `WorkflowApprovalOptions` still
carries no approver, role or permission, and a second approver on someone else's
run is still a matter for the route's own `permissions`.

**What this rules out:** treating a run id as a capability, and adding a new run
read path that does not take a session. It does not rule out a richer approver
model on `WorkflowApprovalOptions` later; that would narrow this gate, never
replace it.
