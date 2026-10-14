---
type: overview
title: Questions
description: Things asked of the graph addon and not yet answered
---

# Questions

Something asked and not yet answered. The code makes a choice nobody has stated,
so the doubt is recorded with the current behaviour, not a guessed rationale.

<!-- pikku:knowledge-index -->
- [Should the graph httpRequest node reach any public host when no secret or allowlist is set?](should-the-graph-http-request-reach-any-public-host.md) — httpRequest is sessionless and takes a caller-chosen URL; safeFetch refuses private addresses but applies no allowlist by default, and a secret's host binding applies only when the secret declares allowed hosts
- [Should the graph JWT sign node mint tokens for any payload with no auth gate?](should-the-graph-jwt-sign-node-mint-tokens-for-any-payload.md) — jwtSign is a sessionless function with no auth, scopes or expose setting, and it encodes any caller-supplied payload into a token; the code does not say whether that reach is intended
<!-- /pikku:knowledge-index -->
