---
type: decision
title: The approval policy decides who answers a tool call
description: The conversation approvals option picks either a fixed answer or the virtual user's model for each pending tool call, and a call with no answer is denied
tags: core, virtual-users, approvals, security
---

# The approval policy decides who answers a tool call

`ConversationApprovalPolicy` in
`packages/core/src/wirings/virtual-user/conversation/conversation.types.ts:1` has
three values, and `approvals` is an optional field on `ConverseOptions` (`:9`).

`decideApprovals` in
`packages/core/src/wirings/virtual-user/conversation/run-conversation.ts:133-181`
applies it. The default is `in-virtual-user` (`:138`). `always` approves every
pending call and `never` denies every one (`:139-144`). `in-virtual-user` sends the
pending calls to the virtual user's model with `tools: []` and `toolChoice: 'none'`
(`:153-169`), and the model's decisions are what get applied.

Every pending call must get a decision. The code maps the answers by `toolCallId`
and a call with no answer is denied (`:176-180`). The missing-decision rule has
its own note,
[missing approval decisions default to denied](virtual-user-conversation-missing-approval-decisions-default-to-denied.md).

**What this rules out:** reading a missing answer as consent, and an
`in-virtual-user` run approving a call the virtual user's model did not name.
