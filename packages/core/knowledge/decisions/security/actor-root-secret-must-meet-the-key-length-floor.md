---
type: decision
title: The actor root secret must meet the key-material length floor
description: A short actor root secret is refused, because every persona credential is derived from it and a weak root makes all of them guessable
tags: core, actor, secrets, personas
---

# The actor root secret must meet the key-material length floor

`ACTOR_ROOT_SECRET_MIN_LENGTH` equals `MIN_KEY_MATERIAL_LENGTH`
(`packages/core/src/services/persona-actor-secret.ts`). The actor plugin checks it
at setup and refuses a shorter root.

The reason is that `deriveActorSecret` is an HMAC-SHA256 over the lowercased
persona email, keyed by the root. Each persona's credential is therefore only as
strong as the root. A short root makes every persona's credential guessable at
once, so the check fails at setup rather than at sign-in.

**What this rules out:** a weak or empty root that would otherwise work for
local testing and then reach a deployed stage.
