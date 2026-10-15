---
type: overview
title: Decisions
description: How the Slack gateway verifies webhooks and caches per-team clients
---

# Decisions

<!-- pikku:knowledge-index -->
- [A Slack team's client is cached after its first token lookup](a-slack-team-client-is-cached-after-its-first-token-lookup.md) — getClient resolves a team's bot token through tokenResolver only on a cache miss and keeps the WebClient; a rotated token is seen only after invalidateClient, and no caller of that method exists in the gateways or core packages
- [Slack webhooks are verified before any event is handled](slack-webhooks-are-verified-before-any-event-is-handled.md) — verifyWebhook checks the Slack signature before it answers a url_verification challenge, and the signature check fails closed on missing headers, a stale timestamp or a mismatched HMAC
<!-- /pikku:knowledge-index -->
