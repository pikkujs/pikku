---
type: question
title: Should a scoped secret view throw from hasSecret for a disallowed key?
description: The SecretService contract says hasSecret answers for any key and must not throw, but the scoped view throws for keys outside its set
tags: core, secrets, scoping
---

# Should a scoped secret view throw from hasSecret for a disallowed key?

The `SecretService` interface in `packages/core/src/services/secret-service.ts:13-14`
says `hasSecret` "answers for any key, including a disallowed one — it must not
throw."

`ScopedSecretService.hasSecret` in `packages/core/src/services/scoped-secret-service.ts:21-24`
calls `assertAllowed` first, and that throws `Access denied to secret key` for a key
outside the view's set (`:10-14`).

The note `a-scoped-secret-view-reads-only-declared-keys-and-never-writes.md` records
that the view's `hasSecret` throws, and treats that as intended.

**Question:** which governs? The view's throw follows its read rule. The contract
says an existence check must not throw for any key. The two cannot both hold for a
disallowed key.
