---
type: decision
title: Credential requests are trusted only when Symbol-branded
description: The string key is a wire field; the Symbol is the capability, and only core can mint it
tags: agent
---

# Credential requests are trusted only when Symbol-branded

A tool result asking the run to suspend and prompt for a credential is honoured
only when it carries the `CREDENTIAL_REQUIRED` Symbol minted in
`agent-prepare.ts`. `checkForCredentialRequests` in `agent-stream.ts`
tests for that Symbol, never for the `__credentialRequired` string key that
travels beside it on the wire.

The distinction is the whole security property. Tool results are frequently
attacker-influenceable — a retrieved document, an echo from a third-party API,
LLM-authored content round-tripping through a tool — and any of those can carry
a string key. None can carry a Symbol, because a Symbol has no literal form and
does not survive JSON. Without the brand, an influenced tool result could
suspend the run and push a `credential-request` event with an attacker-chosen
`connectUrl`, which the client renders as a "Connect" button: a phishing
primitive inside the product's own UI. This mirrors the `APPROVAL_REQUIRED`
brand, which exists for the identical reason one function over.

The brand survives because the object is passed by reference the whole way —
core's `buildToolDefs` wrapper returns it, the Vercel adapter's `agentTool` hands
it back verbatim, and the AI SDK puts the raw value on the stream part rather
than the JSON form it builds separately for the model.

**What this rules out:** widening the check to `'__credentialRequired' in
result` for convenience, or introducing any path where a credential request is
reconstructed from parsed JSON rather than passed by reference — either one
silently converts the gate into a formality. Note the inverse holds for the
`credentialFilteredChannel` suppression later in the same file: that one
deliberately matches the _string_ key, because it hides tool results from the
client and a broader match leaks less, not more.
