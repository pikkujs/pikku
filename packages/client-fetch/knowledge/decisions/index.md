---
type: overview
title: Decisions
description: Rules chosen in the core fetch client, and what each one rules out
---

# Decisions

A rule that was chosen, and what it rules out.

<!-- pikku:knowledge-index -->
- [When both a JWT and an API key are set, the client sends only the Bearer JWT](a-jwt-takes-precedence-over-an-api-key.md) — getHeaders sends Authorization Bearer when a jwt is set and falls back to X-API-KEY only when there is no jwt
<!-- /pikku:knowledge-index -->
