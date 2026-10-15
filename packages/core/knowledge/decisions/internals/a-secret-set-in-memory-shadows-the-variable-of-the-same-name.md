---
type: decision
title: A secret set in memory shadows the variable of the same name
description: LocalSecretService reads its in-memory map before the variables service, stores a SecretValue unwrapped, and treats an empty string as absent
tags: core, secrets, local-dev
---

# A secret set in memory shadows the variable of the same name

`packages/core/src/services/local-secrets.ts` keeps an in-memory map of secrets.
`getSecret` checks that map first (`local-secrets.ts:25-29`). Only when the key is
missing or empty does it fall back to the variables service
(`local-secrets.ts:31-34`), and it throws if neither has the key
(`local-secrets.ts:35`). `hasSecret` follows the same order (`local-secrets.ts:49-52`).

Values are parsed as JSON when possible and kept as the raw string otherwise
(`local-secrets.ts:13-19`).

`setSecret` unwraps a `SecretValue` before storing it (`local-secrets.ts:38-45`).
The comment gives the reason: storing the wrapper "would serialize it to
'[secret]'" (`local-secrets.ts:39`).

`deleteSecret` removes only the in-memory entry (`local-secrets.ts:56-58`), so a
variable of the same name becomes visible again after a delete.

**What this rules out:** a secret written through `setSecret` being replaced by
the value of a variable with the same name, and storing a redacted wrapper in
place of the secret.
