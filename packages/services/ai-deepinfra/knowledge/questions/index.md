---
type: overview
title: Questions
description: Things asked of the DeepInfra provider and not yet answered
---

# Questions

Something asked and not yet answered. The code makes a choice nobody has stated, so the
doubt is recorded with the current behaviour, not a guessed rationale.

<!-- pikku:knowledge-index -->
- [Can a caller's settings.headers override the DeepInfra Authorization header?](can-caller-settings-headers-override-the-authorization-header.md) — resolveConfig spreads settings.headers after the bearer key, so an authorization key in the caller's headers replaces the key; a differently cased key is not covered by this code
<!-- /pikku:knowledge-index -->
