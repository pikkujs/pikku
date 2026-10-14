---
type: overview
title: Decisions
description: How the jose JWT service chooses the key that verifies a token
---

# Decisions

<!-- pikku:knowledge-index -->
- [A kid picks the verification key, and only HS256 is accepted](a-kid-picks-the-verification-key-and-only-hs256-is-accepted.md) — jose-jwt-service.ts signs and verifies with HS256 only, uses the token's kid to choose the secret, falls back to the current secret when there is no kid, and throws for an unknown kid
<!-- /pikku:knowledge-index -->
