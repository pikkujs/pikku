---
type: decision
title: An undeclared scope and a secret service passed under another name are critical diagnostics
description: Post-processing reports a function that requires an undeclared scope, and a function-facing service that is a SecretService under another name
tags: [inspector, scopes, secrets, post-process]
---

# An undeclared scope and a secret service passed under another name are critical diagnostics

Both checks run from `packages/inspector/src/inspector.ts`: `validateNoSecretAliasServices` at line
540, and `validateScopeReferences` at line 580.

`validateScopeReferences` in `packages/inspector/src/utils/post-process.ts` (lines 1588-1615) checks each
function's scopes against the set declared with `defineScope`. A trailing `:*` is stripped before the
lookup (line 1599). A bare `*` is reported (lines 1601-1607), and an undeclared scope is reported with
the list of available scopes (lines 1609-1615). Both are `logger.critical` with `ErrorCode.INVALID_VALUE`.

`validateNoSecretAliasServices` (lines 1401-1431) reports a function-facing service whose type is a
`SecretService` under another name. The comment at lines 1396-1399 says a name-based rule would miss
`pikkuServices(async ({ secrets }) => ({ cfg: secrets }))`, so the check uses the type.

**What this rules out:** a function that requires a scope no `defineScope` declares, and a function
receiving a secret service under a different name.
