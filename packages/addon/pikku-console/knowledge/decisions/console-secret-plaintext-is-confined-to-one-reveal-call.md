---
type: decision
title: Console secret plaintext is revealed in one place, SecretAdminService.read
description: SecretAdminService is the only console code that calls reveal() on a secret, so the plaintext disclosure can be found by grepping for one call; secretGet returns that read under pikku:console:secrets:read
tags: console, secrets, security
---

# Console secret plaintext is revealed in one place, SecretAdminService.read

`SecretAdminService` (`packages/addon/pikku-console/src/services/secret-admin.service.ts`)
holds the `SecretService` so that functions do not receive it. Its comment says that
keeping it there "makes the plaintext disclosure a single greppable `.reveal()`
rather than one per function" (`secret-admin.service.ts:6-9`).

`read` returns `{ exists: false, value: null }` for an unknown secret
(`secret-admin.service.ts:19-21`), and otherwise returns `secret.reveal()` as
`value` (`secret-admin.service.ts:22-23`).

`secretGet` (`packages/addon/pikku-console/src/functions/secret-get.function.ts`)
is `expose: true` and gated by `pikku:console:secrets:read`
(`secret-get.function.ts:9-10`). It returns `secretAdminService.read(secretId)`
unchanged (`secret-get.function.ts:11-12`), so a holder of that scope receives the
plaintext value.

**What this rules out:** a second function or service that reveals a secret value,
and reaching the `SecretService` from a console function body.
