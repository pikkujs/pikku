---
type: decision
title: Working memory is persisted only when the merged value validates
description: A failed schema check logs and drops the update rather than saving it, because invalid state poisons every later read
tags: ai-agent
---

# Working memory is persisted only when the merged value validates

`createWorkingMemoryMiddleware` in
`packages/core/src/wirings/ai-agent/ai-agent-memory.ts` parses the model's
`<working_memory>` block, deep-merges it into the stored value, validates the
merge against the agent's working-memory schema when one is declared, and calls
`saveWorkingMemory` only if the merge is valid. An invalid merge is logged as a
warning and discarded.

Working memory is read back into the system prompt on every subsequent run of the
thread, so a bad write is not a one-turn mistake — it is a permanently malformed
prompt that the model then has to reason around, and which the model itself
cannot repair. Dropping the update is recoverable; the next turn simply tries
again.

**What this rules out:** saving first and validating on read, persisting the raw
model output before the merge, and treating a validation failure as fatal to the
run.
