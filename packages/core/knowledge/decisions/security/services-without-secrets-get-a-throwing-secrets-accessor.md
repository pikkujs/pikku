---
type: decision
title: Contexts that must not hold secrets get a services bag whose secrets accessor throws
description: withoutSecrets replaces the secrets entry with a non-enumerable getter that throws, so code outside the permitted contexts cannot reach the secret service
tags: core, secrets, services
---

# Contexts that must not hold secrets get a services bag whose secrets accessor throws

`packages/core/src/services/secretless.ts` exports `withoutSecrets`. If the
services object has no `secrets` key, it is returned unchanged
(`secretless.ts:17-19`). Otherwise a shallow copy is made, and `secrets` is
redefined as a getter that throws `SecretAccessDeniedError`
(`secretless.ts:20-27`). The property is non-enumerable and configurable
(`secretless.ts:25-26`), so a spread of the object does not copy it.

The error message says `secrets` is confined to `pikkuServices`,
`pikkuWireServices`, addon service factories and middleware, and tells the caller
to give the service the secret at construction time instead (`secretless.ts:6`).

**What this rules out:** reading `services.secrets` from a context that is not on
that list, and a secret leaking through a copy of the services object.
