---
type: decision
title: A running project reads secrets from Vault and cannot write them
description: VaultSecretService reads over HTTP using a host and token from a connection file, reads values, and throws on set and delete, pointing at Pikku Studio
tags: cli, secrets, vault
---

# A running project reads secrets from Vault and cannot write them

`packages/cli/src/utils/vault-secret-service.ts` calls the vault host over HTTP
with `CorePikkuFetch` from `@pikku/fetch` (not `wireRemoteAddon`: the CLI builds
its secret service before the app services exist, and that would add a `vault`
namespace to every project). `vaultConnectionFromEnv` returns a connection only
when `PIKKU_VAULT_CONNECTION_FILE` is set; the old `PIKKU_VAULT_SOCKET` and
`PIKKU_VAULT_TOKEN` are ignored. The file is JSON `{ url, token }` that Studio
rewrites atomically.

Reads go to `POST /rpc/vault:secretGetOwn@v1` (and `secretHasOwn@v1`) with the
`x-pikku-remote-contract` header and the token as a bearer. On a 401 or a
connection error the file is read again once and the call retried, so a renewed
token or a new host port reaches a running project. Every call has a 5-second
deadline. Errors carry the key and a status, never the token or a value.

`setSecret` and `deleteSecret` throw, and the service is never `durable`. Both
messages say secrets are written through Pikku Studio, not from a running project.

**What this rules out:** a deployed process rotating or removing its own secrets,
and a second write path that bypasses Studio's audit.
