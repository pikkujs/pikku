---
type: decision
title: Gateway webhook challenges echo bytes not JSON
description: String verification challenges are returned raw with returnsJSON false, because platforms byte-compare the echo and JSON quoting fails the handshake
tags: gateway
---

# Gateway webhook challenges echo bytes not JSON

Webhook verification handshakes (WhatsApp's `hub.challenge`, similar GET
challenges elsewhere) are validated by the platform doing a byte-for-byte
comparison of the response body against the challenge it sent. JSON-encoding a
string challenge adds surrounding quotes and fails the handshake, and the gateway
is then never activated.

`wireWebhookGateway` in
`packages/core/src/wirings/gateway/gateway-runner.ts` therefore registers the GET
verification route with `returnsJSON: false`, and
`createWebhookVerifyHandler` returns `String(response)` when the adapter's
`WebhookVerificationResult.response` is a string or number. Object responses
(Slack's `url_verification` style) still go out as JSON, with the
`content-type: application/json` header set explicitly by the handler, since the
route no longer does it.

**What this rules out:** setting `returnsJSON: true` on the gateway GET route for
consistency with other routes, and routing the challenge response through the
normal JSON serializer. Any change that makes the string branch serialize as JSON
breaks webhook activation on every platform that byte-compares.
