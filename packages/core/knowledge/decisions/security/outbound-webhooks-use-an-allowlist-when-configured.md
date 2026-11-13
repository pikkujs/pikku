---
type: decision
title: Outbound webhooks use an allowlist when one is configured, and block private hosts unless privateHosts names them
description: The webhook delivery passes config.webhook.allowedHosts and privateHosts to safeFetch; an allowlist narrows delivery and never unlocks a private address on its own
tags: core, webhooks, ssrf, security
---

# Outbound webhooks use an allowlist when one is configured, and block private hosts unless privateHosts names them

`WebhookServiceConfig` in `packages/core/src/services/webhook-service.ts` carries
`allowedHosts` (when set, only matching hosts may be delivered to) and
`privateHosts` (hosts allowed to be, or resolve to, a private address).

`pikkuWebhookWorkerFunc` in `queue-webhook-service.ts` reads both from
`config.webhook`, falls back to neither if the singletons are not initialised,
and passes them to `safeFetch`.

A receiver on an internal network needs to be listed in `privateHosts`; listing
it in `allowedHosts` alone is refused. See
[an allowlist narrows egress](an-allowlist-narrows-egress-and-never-unlocks-a-private-address.md).

**What this rules out:** delivering to a host outside a configured allowlist, and
delivering to a private host that `privateHosts` does not name.
