---
type: decision
title: A credential-required tool result never reaches the client or the transcript
description: The run suspends with credential-request events instead, leaving the tool call unresulted so it can be resumed after connecting
tags: agent
---

# A credential-required tool result never reaches the client or the transcript

When a tool returns the `__credentialRequired` marker,
`streamAgent` in `packages/core/src/wirings/agent/agent-stream.ts`
filters that `tool-result` out of the channel before it can be streamed or
persisted, and `handleCredentialRequests` suspends the run and emits
`credential-request` events carrying the `runId` instead. Those events — not the
tool result — are what tells a client to show Connect/Ignore, mirroring how
approval suspensions work.

Leaving the tool call unresulted in the persisted history is what makes the
resume possible: once the credential is connected, `/resume` re-executes the call
against a history that does not already contain a bogus answer. `runStreamStepLoop`
still appends the step messages before returning the credential outcome, so the
assistant's tool call itself survives into the resume.

**What this rules out:** streaming the marker result as a normal tool result and
filtering it client-side; persisting it as the tool's answer; and skipping
`appendStepMessages` on the credential path because the run is about to suspend.
