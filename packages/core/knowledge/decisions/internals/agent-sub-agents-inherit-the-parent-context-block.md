---
type: decision
title: A delegated sub-agent inherits the parent run's context block
description: The sub-agent tool schema carries only message and session, so the parent's identifier block is forwarded rather than re-typed by the model
tags: agent
---

# A delegated sub-agent inherits the parent run's context block

`buildSubAgentRunInput` in
`packages/core/src/wirings/agent/agent-prepare.ts` forwards the parent
run's `AgentInput.context` — the "Current context" identifier block with
organization, project and stage ids — into every delegated sub-agent run, on
both the streaming and non-streaming paths. `buildToolDefs` threads it down as
`parentContext` for the same reason.

A sub-agent is exposed to the parent model as a tool whose input schema is only
`{ message, session }`. Without inheritance the sub-agent never sees the
authoritative ids and has to rely on the parent model re-typing them into
`message`. Weaker models mangle that, and the result is schema and permission
rejections followed by retry loops rather than a clean failure.

**What this rules out:** constructing the sub-agent run input inline from
`{ message, threadId, resourceId }`, widening the sub-agent tool schema so the
model supplies the ids itself, and dropping `parentContext` from `buildToolDefs`
because "nothing reads it here".
