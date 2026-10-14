---
type: decision
title: Outbound webhooks use an allowlist when one is configured, and block private hosts otherwise
description: The webhook delivery reads allowedHosts from config and passes it to safeFetch; without an allowlist safeFetch refuses private hosts, and an allowlist replaces that check
tags: core, webhooks, ssrf, security
---

# Outbound webhooks use an allowlist when one is configured, and block private hosts otherwise

`WebhookServiceConfig.allowedHosts` in `packages/core/src/services/webhook-service.ts:33-44`
says that when it is set only those hostnames may be delivered to, and when it is
omitted private and internal hosts are blocked.

`queue-webhook-service.ts:104-110` reads it from `config.webhook`, and falls back
to no allowlist if the singletons are not initialised. The value is passed to
`safeFetch` (`:112-122`).

In `packages/core/src/utils/safe-fetch.ts:265-273`, an allowlist makes the check an
exact hostname match, and the private-host refusal is in the `else` branch that only
runs without an allowlist. So with an allowlist, a listed host is not refused for
being private.

**What this rules out:** delivering to a host outside a configured allowlist, and
delivering to a private host when no allowlist is configured.
