---
type: decision
title: An approval answer with no run id is dropped, and a failed acknowledgement of an earlier approval is only logged
description: handleApproval returns false for an unknown approval or one with no runId, and for a batch it reports true even when the resume request threw
tags: assistant-ui, agents, approvals
---

# An approval answer with no run id is dropped, and a failed acknowledgement of an earlier approval is only logged

`handleApproval` in `packages/assistant-ui/src/use-pikku-agent-runtime.ts` looks the tool call up in the
pending list (lines 520-522). When it is not there, or the entry has no `runId`, it returns `false` and does
nothing else (line 523). The pending entry is not removed in that case. The `runId` is filled from the
`pikku:approval-request` and `pikku:credential-request` events (lines 442-469). The default context value
also answers `false` (lines 65-68), and the type says callers must gate their `addResult` on this boolean
(lines 59-62).

When the entry is found, it is removed from the pending list at once (lines 524-527). If other approvals
remain, the answer is posted to `<api>/<agent>/resume` as a plain request (lines 530-546). A thrown error is
caught and only written to `console.error` (lines 548-550), and the function still returns `true`
(lines 552-553). The final approval is not posted: it is queued on the agent and sent when the caller's
`addResult` starts the resume run (lines 556-558), as the comment at lines 513-517 explains.

The resume body is `{ runId, toolCallId, approved }` (line 528). Nothing in this file carries a session; the
request relies on the `credentials` and `headers` options (lines 539-543).

**What this rules out:** treating `true` from `handleApproval` as proof the server recorded an earlier answer in
a batch, and answering an approval request that arrived without a `runId`.
