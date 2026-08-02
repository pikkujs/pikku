---
type: decision
title: TypedSecretService caches for the process lifetime
description: Resolved secrets are cached with no TTL, so a secret rotated out of band is not picked up until restart — tracked as pikkujs/pikku#964
tags: services
---

# TypedSecretService caches for the process lifetime

`TypedSecretService` (`packages/core/src/services/typed-secret-service.ts`) keeps
an in-process `Map` of resolved secrets so callers can read naively without
hitting the underlying secret service on every call. Only successful reads are
cached — a miss throws and is not stored, so the cache never memoises a negative
— and `setSecret` / `deleteSecret` invalidate the key they touch.

There is no TTL and no background refresh. One instance is created per
`createSingletonServices`, which in practice means once per process, so a secret
rotated out of band is not observed until the process restarts. That is a known
gap, tracked as pikkujs/pikku#964, not an oversight to rediscover.

**What this rules out:** assuming a rotation flow that writes to the secret
backend takes effect in a running instance — it does not; the deployment has to
cycle. It also means this cache is not a read-through cache in the usual sense,
so do not "fix" it by caching misses. Related: the cached values are plaintext
secrets held on the long-lived singleton services object, which is why a batch
`getSecrets([...everything])` should be avoided.
