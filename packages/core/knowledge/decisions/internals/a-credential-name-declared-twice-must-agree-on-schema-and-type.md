---
type: decision
title: A credential name declared twice must agree on its schema and its type
description: validateAndBuildCredentialDefinitionsMeta throws when two declarations of one credential name differ in schema or in type, and otherwise keeps the first declaration
tags: core, credentials, validation
---

# A credential name declared twice must agree on its schema and its type

`packages/core/src/wirings/credential/validate-credential-definitions.ts` builds
the credential metadata, keyed by name.

When a name repeats, the schema is compared first, but only if both declarations
resolve to a schema reference (`validate-credential-definitions.ts:19-23`). Two
references differ when their variable name or source file differs
(`validate-credential-definitions.ts:24-27`). A difference throws, and the message
says "Credentials sharing a name must use the same schema"
(`validate-credential-definitions.ts:28-33`).

The `type` field is then compared (`validate-credential-definitions.ts:38-45`).
The type is `'singleton' | 'wire'` (`credential.types.ts:26`). A different type
throws with the message "Credentials sharing a name must use the same type"
(`validate-credential-definitions.ts:43`).

When both checks pass, the repeat is skipped and the first declaration stays
(`validate-credential-definitions.ts:47`).

**What this rules out:** two addons declaring the same credential name with
different schemas or read modes, and a silent choice between them.
