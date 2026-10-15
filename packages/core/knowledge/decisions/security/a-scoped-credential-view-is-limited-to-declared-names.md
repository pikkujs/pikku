---
type: decision
title: A scoped credential service is limited to the names its package declared
description: ScopedCredentialService refuses any credential name outside the package's declared set, filters getAll to that set, and refuses to enumerate users
tags: core, credentials, scoping
---

# A scoped credential service is limited to the names its package declared

`packages/core/src/services/scoped-credential-service.ts` wraps a
`CredentialService` with the set of names a package declared. The doc comment
says it "cannot reach a credential it never declared, or enumerate the app's
users" (`scoped-credential-service.ts:6-9`).

- `get`, `set`, `delete`, `has` and `getUsersWithCredential` each call
  `assertAllowed` and throw `Access denied to credential` for an undeclared name
  (`scoped-credential-service.ts:16-20`, `23`, `28`, `33`, `38`, `54`).
- `getAll(userId)` returns only the declared names that the user holds
  (`scoped-credential-service.ts:42-51`).
- `getAllUsers` always throws (`scoped-credential-service.ts:58-62`).

Writes are allowed for declared names (`scoped-credential-service.ts:27-30`), per
the doc comment at `scoped-credential-service.ts:6-8`.

**What this rules out:** a package reading or writing another package's
credential, and a package listing every user of the app.
