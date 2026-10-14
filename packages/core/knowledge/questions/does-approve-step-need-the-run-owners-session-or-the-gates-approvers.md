---
type: question
title: Does approveStep need the run owner's session, as its doc says, or only what the gate's approvers policy allows?
description: The WorkflowService doc says the session must belong to the run's owner, but the implementation judges the session against the gate's published policy, whose default is any
tags: workflow, approvals, sessions, comment-vs-code
---

# Does approveStep need the run owner's session, as its doc says, or only what the gate's approvers policy allows?

**The comment.** The doc on `approveStep` in `packages/core/src/services/workflow-service.ts` says: "The session
must belong to the run's owner — see `assertWorkflowRunOwner`" (line 52). The method takes the session as
optional (`session?: CoreUserSession`, lines 54-58).

**The code.** `PikkuWorkflowService.approveStep` in `packages/core/src/wirings/workflow/pikku-workflow-service.ts`
(lines 1804-1817) does not call `assertWorkflowRunOwner`. It passes `approvalDeciderFrom(session)` to
`recordApprovalDecision`. That helper reduces the session to `{ userId, scopes }`, or `undefined` when there is
no session (`packages/core/src/wirings/workflow/workflow-approval-policy.ts:21-24`).

`recordApprovalDecision` (`packages/core/src/wirings/workflow/workflow-approval.ts:98-104`) judges the decider only
when the gate has already published a policy (`workflow-approval.ts:125-141`). The policy check is
`approvalPolicyRefusal`, which defaults `approvers` to `'any'` (`workflow-approval-policy.ts:46`, `:65-66`).
Only `'owner'` compares the decider with the run's owner (`:47-54`), and it lets everyone through when the run
has no recorded owner (`:48-50`). `'not-initiator'` refuses the owner (`:56-63`). A decision recorded before the
gate publishes its policy is not judged at that point (`workflow-approval.ts:125`).

The decision note
[a workflow run is read by its owner, and answered by whoever its gate declares](../decisions/security/a-workflow-run-is-read-and-approved-by-its-owner.md)
records the design as the gate's `approvers`. The comment at `workflow-service.ts:52` still describes the earlier
rule that note says it replaced. The reference at `packages/core/src/wirings/workflow/workflow-run-ownership.ts:19`
already points to `approvers`.

**Question:** should the comment at `workflow-service.ts:52` be rewritten to describe the gate's policy, or is any
caller meant to be held to the owner's session regardless of the policy? As the code stands, a gate with the
default policy accepts an answer from no session at all.
