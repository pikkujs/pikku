---
type: decision
title: A kid picks the verification key, and only HS256 is accepted
description: jose-jwt-service.ts signs and verifies with HS256 only, uses the token's kid to choose the secret, falls back to the current secret when there is no kid, and throws for an unknown kid
tags: [jose, jwt, keys]
---

# A kid picks the verification key, and only HS256 is accepted

`packages/services/jose/src/jose-jwt-service.ts` signs with the protected header
`alg: 'HS256'` and the current secret's id as `kid` (`jose-jwt-service.ts:60-66`).
Both `decode` and `verify` pass `algorithms: ['HS256']` to `jwtVerify`
(`jose-jwt-service.ts:76`, `jose-jwt-service.ts:87`).

The secret is chosen in `getSecret` (`jose-jwt-service.ts:96-116`):

- A token with no `kid` is checked with the current secret. If none is loaded yet,
  `init()` runs first, and an empty result throws `No secrets configured`
  (`jose-jwt-service.ts:99-106`).
- A token with a `kid` is looked up in the secrets map. A miss runs `init()` once
  more, and a second miss throws `Missing secret for id: <kid>`
  (`jose-jwt-service.ts:108-114`).

`init()` sets the current secret from the same array it stores. It walks the
array with `reduceRight`, so the last assignment is the first element of the list
returned by `getSecrets()` (`jose-jwt-service.ts:33-37`).

**What this rules out:** verifying a token with any algorithm other than HS256, and a
token whose `kid` names no loaded secret being accepted with some other key.
