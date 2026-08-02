---
type: decision
title: Delegate mode hides the parent's later text, supervise mode hides the sub-agent's
description: Exactly one voice reaches the client per agent-mode; approvals and tool events always flow through either way
tags: ai-agent
---

# Delegate mode hides the parent's later text, supervise mode hides the sub-agent's

An agent with sub-agents runs in one of two modes. In `'delegate'` (the default,
handled in `streamAIAgent` in `ai-agent-stream.ts`) the parent's `text-delta` and
`reasoning-delta` events are suppressed *after* the first sub-agent call —
`delegateState.delegated` is the latch — so a parent that answers directly still
streams normally, while a parent that hands off does not narrate over its
sub-agent. In `'supervise'` (handled where the sub-agent channel is built in
`buildToolDefs` in `ai-agent-prepare.ts`) the inverse holds: the sub-agent's text
and reasoning are dropped and only the supervisor speaks.

Suppression is confined to text and reasoning. Approval requests, tool calls,
tool results, usage and errors flow through in both modes, because a suppressed
approval would deadlock the run.

**What this rules out:** filtering sub-agent events at the transport instead of
at the scoped channel; suppressing parent text unconditionally in delegate mode
(direct answers would vanish); and adding new event types to either filter
without checking they are not part of the approval handshake.
