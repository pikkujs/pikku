---
type: decision
title: An inbound webhook source dispatches only requests verified against its credential
description: A webhook source with verify refuses a body-carrying request that fails its check, fails closed on an empty secret, and does not dispatch events from a body-less request
tags: core, webhooks, trigger, security
---

# An inbound webhook source dispatches only requests verified against its credential

`verifyRequest` in `packages/core/src/wirings/trigger/webhook-source-runner.ts:173-200`
decides whether a request counts as signed. A source with no `verify` returns
true (`:178`). Otherwise the secret is read from the credential named by
`source.credential`, or from `webhookSecretCredentialName` (`:180-182`).

When the secret is missing or empty, a body-less request is treated as
unverified (`:184`), and a request with a body throws `UnauthorizedError`
(`:185-187`). `signedWith` also fails closed on an empty secret (`:127-128`).
The token form compares with `timingSafeStringEqual` (`:153-155`), which is
defined in `packages/core/src/utils/hmac.ts:57-63`.

A mismatch on a request with a body throws (`:199`). A body-less request is not
an error, but the runner refuses any events it produces: if `verified` is false
and `receive` returned events, it throws `UnauthorizedError` (`:273-276`). The
same contract is documented for authors at
`packages/core/src/wirings/trigger/webhook-source.types.ts:130-135`, and the
helper that runs the source's steps calls `runPikkuFunc` with `auth: false`
(`webhook-source-runner.ts:96-101`), so the signature, not a session, is the
gate.

**What this rules out:** dispatching events from a body-carrying request that did
not verify, and treating an empty signing secret as a valid key.
