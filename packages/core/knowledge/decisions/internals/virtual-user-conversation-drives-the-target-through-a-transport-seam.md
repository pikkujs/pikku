---
type: decision
title: The conversation engine only sees a transport-agnostic target driver
description: The engine never imports the agent runner; the target is injected as run/approve, so scenarios exercise the real wire path
tags: virtual-user-conversation
---

# The conversation engine only sees a transport-agnostic target driver

`runConversation` reaches the target agent exclusively through the injected
`TargetAgentDriver` — `run(message)` and `approve(runId, decisions)` — declared
in `packages/core/src/wirings/virtual-user/conversation/conversation.types.ts`. In production that
driver is HTTP-backed, issuing the virtual user's `agentRun` and `agentApprove` calls as
the signed-in virtual user.

Keeping the seam transport-agnostic is what makes the conversation a real test:
the agent is exercised through the same authenticated wire path a user takes,
including middleware, permissions and session handling, rather than through an
in-process call that skips all of it. It also lets the engine be unit-tested
against scripted targets with no server at all.

**What this rules out:** calling `runAgent` / `streamAgent` directly from the
conversation engine, and widening `TargetAgentDriver` with transport details
(headers, cookies, channels) that would tie the engine to HTTP.
