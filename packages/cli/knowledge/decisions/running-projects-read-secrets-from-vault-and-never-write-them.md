---
type: decision
title: A running project reads secrets from Vault and cannot write them
description: VaultSecretService authenticates with PIKKU_VAULT_TOKEN over a unix socket, reads values, and throws on set and delete, pointing at Pikku Studio
tags: cli, secrets, vault
---

# A running project reads secrets from Vault and cannot write them

`packages/cli/src/utils/vault-secret-service.ts` connects to Vault over a unix
socket. `vaultConnectionFromEnv` returns a connection only when both
`PIKKU_VAULT_SOCKET` and `PIKKU_VAULT_TOKEN` are set (`vault-secret-service.ts:12-18`).
Each request carries the token as a bearer header (`vault-secret-service.ts:30`).

Reads are the only writes-free path. `getSecret` and `hasSecret` call
`/v1/secrets/...` (`vault-secret-service.ts:63-83`). Every call has a 5-second
deadline (`vault-secret-service.ts:5`, `vault-secret-service.ts:48-51`).

`setSecret` and `deleteSecret` throw. Both messages say secrets are written
through Pikku Studio, not from a running project (`vault-secret-service.ts:85-91`).

**What this rules out:** a deployed process rotating or removing its own secrets,
and a second write path that bypasses Studio's audit.
