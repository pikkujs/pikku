---
type: decision
title: A tool's execute() failure is logged before the AI SDK swallows it
description: Every agent tool is wrapped in a logging try/catch, because a thrown tool error otherwise becomes a conversational reply and is invisible server-side
tags: ai-agent
---

# A tool's execute() failure is logged before the AI SDK swallows it

`buildToolDefs` in `packages/core/src/wirings/ai-agent/ai-agent-prepare.ts`
wraps every tool it builds — RPC tools, sub-agent delegations and workflow tools
alike — in a `try/catch` that logs through `singletonServices.logger` and
rethrows.

A tool's `execute()` can throw for ordinary reasons: bad model-supplied input, an
RPC failure, a database error. The AI SDK catches that at the tool-call boundary
and turns it into a conversational "tool error" reply to the model. The exception
never reaches pikku's own logger, so without this wrapper a consistently failing
tool is undiagnosable from the server side — the only symptom is an agent that
keeps apologising. The wrapper is applied unconditionally, not only when an
`aiMiddleware` `afterToolCall` hook happens to be registered.

**What this rules out:** folding the logging into the optional middleware
wrapper below it, and relying on the AI SDK's own error reporting for tool
failures.
