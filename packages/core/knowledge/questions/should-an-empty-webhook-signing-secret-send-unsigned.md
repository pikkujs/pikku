---
type: question
title: Should an outgoing webhook go out unsigned when its configured signing secret resolves empty?
description: When config.webhook.secret names a secret that resolves to nothing, the delivery is logged as unsigned and enqueued without a signature
tags: core, webhooks, signing
---

# Should an outgoing webhook go out unsigned when its configured signing secret resolves empty?

`prepareDelivery` in `packages/core/src/services/queue-webhook-service.ts:52-66`
reads the signing secret from `config.webhook.secret` when the caller passed none
(`:53-55`). If that secret resolves to nothing, the code logs an error that says
the outgoing webhooks "will be sent UNSIGNED" (`:56-60`) and carries on. The
signature header is added only when a secret is present (`:62-66`), so the job
is enqueued without one.

The existing note `webhook-bodies-are-signed-before-they-are-enqueued.md` covers
signing at enqueue time and the key staying out of the queue payload. It does not
cover this fallback.

**Question:** should a configured but empty signing secret send the delivery
unsigned with a log line, or refuse to enqueue it? The code takes the first
option. Nothing in the file records a reason, and the only signal is the log.
