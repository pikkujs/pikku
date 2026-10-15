---
type: decision
title: The dev credential key survives restarts in a 0600 file
description: pikku dev reads the credential encryption key from an env var or a runtime-dir file created once with mode 0600, and falls back to in-memory credentials when no database is present
tags: cli, dev, credentials, encryption
---

# The dev credential key survives restarts in a 0600 file

`resolveDevCredentialsKey` in `packages/cli/src/functions/commands/dev-credentials.ts`
takes the key from `PIKKU_DEV_CREDENTIALS_KEY` when set (`dev-credentials.ts:23-24`).
Otherwise it reads `dev-credentials.key` from the runtime directory
(`dev-credentials.ts:26-30`). The comment says the key must outlive the process,
or every credential stored before a restart becomes unreadable while its session
stays valid (`dev-credentials.ts:14-18`).

A new key is written with mode `0600` and flag `wx`, so an existing file is never
overwritten. If the write loses a race (`EEXIST`) the existing key is read back
(`dev-credentials.ts:31-42`).

`createDevCredentialService` uses the Kysely store only when a database handle is
given. Without one it returns `LocalCredentialService` (`dev-credentials.ts:61`).
If the store fails to initialise, it also falls back and warns only when
credentials are expected (`dev-credentials.ts:65-75`).

**What this rules out:** a dev key regenerated on each start, and a key kept in
the project tree.
