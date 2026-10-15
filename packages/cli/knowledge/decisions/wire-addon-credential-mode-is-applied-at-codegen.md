---
type: decision
title: A wireAddon credential mode is applied at codegen, not at runtime
description: pikku-command-credentials resolves wireAddon mode overrides into the credentials meta file, so the console reads the final mode from disk
tags: cli, credentials, addons, codegen
---

# A wireAddon credential mode is applied at codegen, not at runtime

`applyWiredCredentialModes` in `packages/cli/src/functions/wirings/credentials/pikku-command-credentials.ts`
copies each `wireAddon` credential override's `mode` onto the matching credential
definition (`pikku-command-credentials.ts:16-37`). The comment says the console reads
the mode from the generated file rather than from runtime state, so the override has
to be resolved here or the connect flow stays hidden for a credential the deployment
made per-user (`pikku-command-credentials.ts:9-15`).

The call sits between building the meta and writing it (`pikku-command-credentials.ts:53-57`).
The meta JSON is written after that (`pikku-command-credentials.ts:69-75`), so the
file carries the overridden mode.

**What this rules out:** a console that decides a credential's mode from a running
process, and an override that exists only in one runtime.
