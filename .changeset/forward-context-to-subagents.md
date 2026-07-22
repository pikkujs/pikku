---
'@pikku/core': patch
---

Forward the parent run's `context` into delegated sub-agent invocations.

A supervisor agent's injected `context` (the "Current context" block holding the
authoritative identifiers — organizationId, project/stage ids) was appended only
to the supervisor's own instructions. When it delegated, the sub-agent tool's
input schema carries just `{ message, session }`, and `buildToolDefs` invoked the
sub-agent with `{ message, threadId, resourceId }` — dropping the context. The
sub-agent therefore never saw the real ids and depended on the model re-typing
them into the free-text `message`, which weaker models routinely botch, producing
schema-validation and permission rejections that the agent then retries — burning
steps and ballooning the transcript.

`buildToolDefs` now takes the parent `context` and forwards it (via the new
`buildSubAgentRunInput` helper) into both the streaming and non-streaming
sub-agent invocations, so a specialist inherits the same identifier block in its
instructions.
