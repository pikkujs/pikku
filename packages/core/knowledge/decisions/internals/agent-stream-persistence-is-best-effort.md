---
type: decision
title: Persisting an agent stream from send is best-effort and must never reject
description: The persisting channel flushes fire-and-forget because send is synchronous; a storage failure degrades the transcript instead of killing the process
tags: agent
---

# Persisting an agent stream from send is best-effort and must never reject

`createPersistingChannel` in
`packages/core/src/wirings/agent/agent-stream.ts` accumulates step text,
tool calls and tool results, and writes them via `flushDetached` on the `usage`
and `done` events. `AgentStreamChannel.send` is synchronous, so it cannot await the
write. An unawaited rejection has nothing to propagate to and surfaces as an
`unhandledRejection`, which takes the whole server process down — a model
reusing a `toolCallId`, which is a primary key in AI storage, is enough to
trigger it. `flushDetached` therefore catches and logs, and the run carries on.

The awaited `flush()` on the suspend paths (`handleApprovals`,
`handleCredentialRequests`) is the seam that still surfaces persistence failures
to a caller. The regression test lives in `agent-stream.test.ts`; because the
floating promise settles on a later macrotask, the assertion has to wait a real
timer before checking that no `unhandledRejection` fired.

**What this rules out:** letting `flushStep()` be called bare from `send`,
rethrowing from the catch to "not hide" storage errors, and asserting on
unhandled rejections synchronously after the last event.
