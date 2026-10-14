---
type: decision
title: The approval policy decides who answers a tool call
description: The actor-flow approvals option picks either a fixed answer or the persona model for each pending tool call, and a call with no answer is denied
tags: core, actor-flow, approvals, security
---

# The approval policy decides who answers a tool call

`ActorFlowApprovalPolicy` in `packages/core/src/wirings/actor-flow/actor-flow.types.ts:1`
has three values, and `approvals` is an optional field on `ConverseOptions` (`:9`).

`decideApprovals` in `packages/core/src/wirings/actor-flow/run-conversation.ts:128-172`
applies it. The default is `in-persona` (`:133`). `always` approves every pending
call and `never` denies every one (`:134-139`). `in-persona` sends the pending calls
to the persona model with `tools: []` and `toolChoice: 'none'` (`:148-164`), and
the model's decisions are what get applied.

Every pending call must get a decision. The code maps the answers by `toolCallId`
and a call with no answer is denied (`:171-172`). The missing-decision rule has
its own note, `actor-flow-missing-approval-decisions-default-to-denied.md`.

**What this rules out:** reading a missing answer as consent, and an `in-persona`
run approving a call the persona model did not name.
