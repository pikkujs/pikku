---
type: decision
title: Slack webhooks are verified before any event is handled
description: verifyWebhook checks the Slack signature before it answers a url_verification challenge, and the signature check fails closed on missing headers, a stale timestamp or a mismatched HMAC
tags: [slack, webhooks, signatures]
---

# Slack webhooks are verified before any event is handled

`verifyWebhook` in `packages/gateways/slack/src/slack-gateway-adapter.ts:113-117` calls
`assertValidSignature` first. Only after that does it inspect the payload's `type`.
A `url_verification` payload gets the challenge back (`slack-gateway-adapter.ts:119-127`).
Every other payload returns `{ verified: false }` (`slack-gateway-adapter.ts:128`).

`assertValidSignature` (`slack-gateway-adapter.ts:135-158`) rejects in four cases,
each with an `UnauthorizedError`:

- No HTTP request is available (`slack-gateway-adapter.ts:138-142`).
- Either `x-slack-signature` or `x-slack-request-timestamp` is missing
  (`slack-gateway-adapter.ts:143-147`).
- The HMAC does not match (`slack-gateway-adapter.ts:149-158`).

The comparison itself is `verifySlackSignature` in
`packages/gateways/slack/src/slack-signature.ts`. It returns false when the secret or
the signature is empty (`slack-signature.ts:21-22`). It returns false when the
timestamp is more than 300 seconds from now (`slack-signature.ts:24-28`). Otherwise it
HMACs `v0:{timestamp}:{body}` and compares with `timingSafeStringEqual`
(`slack-signature.ts:31-35`).

The window check does not cover every timestamp. A non-numeric value is not caught,
and that is recorded in the question note
`does-a-non-numeric-slack-timestamp-skip-the-replay-window.md`.

**What this rules out:** parsing or answering a Slack payload before its signature is
checked, and accepting a request with a missing header or a bad HMAC.
