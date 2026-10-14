---
type: decision
title: The generated setup wrapper builds services.auth lazily and once from the app's authFactory
description: pikkuServices attaches an auth service that runs the app's authFactory on first use, caches the instance, and clears the cache when the build fails
tags: cli, codegen, setup, auth, services
---

# The generated setup wrapper builds services.auth lazily and once from the app's authFactory

`serializeSetupTypes` in `packages/cli/src/functions/wirings/setup/serialize-setup-types.ts`
generates `pikkuServices`. The function it accepts returns services without `auth`
(`serialize-setup-types.ts:62-63`, the type is `Partial<Omit<RequiredSingletonServices, 'auth'>>`).
The wrapper adds `auth` itself.

It reads `authFactory` from package state (`serialize-setup-types.ts:80`). When one is
registered, it sets `services.auth` to a function (`serialize-setup-types.ts:81-83`).
That function calls the factory once and caches the promise (`serialize-setup-types.ts:84-85`).
If the factory rejects, the cache is cleared so the next call tries again
(`serialize-setup-types.ts:86-89`).

**What this rules out:** running the app's auth factory at boot rather than on first
use, caching a failed auth build so that every later call fails, and putting `auth`
in the setup function's return type.
