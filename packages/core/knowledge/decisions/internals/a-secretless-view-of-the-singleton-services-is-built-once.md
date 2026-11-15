---
type: decision
title: A secretless view of the singleton services is built once
description: The permission runner reads a cached secretless view per singleton services object and context; per-invocation service objects are never cached
tags: core, secrets, performance
---

# A secretless view of the singleton services is built once

`withoutSecrets` copies the services object and shadows `secrets` with a throwing
accessor. The permission runner calls it with the singleton services on every
request, so `secretlessView` memoizes the copy in a `WeakMap` keyed on the
services object, then on the context string, so the error still names a
permission rather than a function.

The cache is keyed on the object, so two services objects never share a view, and
only the singleton services take this path. The services handed to a function body
are rebuilt per invocation (wire services, audit, trace-scoped queue and scheduler
wrappers, the analytics accessor) and still go through uncached `withoutSecrets`;
caching them would pin a per-request object.

The view is a snapshot. A service added to or replaced on the singleton services
object after the first request is not seen by permissions. Singleton services are
assembled at startup and not mutated afterwards; a test that swaps one on a shared
object must use a fresh object.

A services object without `secrets` is returned as it is and is not cached: the
pass-through is the object itself, so caching it would leak `secrets` if one were
attached later. Only a real stripped copy is memoized.
