---
type: decision
title: A credential's wire or singleton type is a literal the inspector checks at declaration
description: defineCredential is a no-op read by AST, so its type must be a literal 'wire' or 'singleton' and the inspector refuses any other value
tags: core, credentials, inspector, declaration
---

# A credential's wire or singleton type is a literal the inspector checks at declaration

`defineCredential` in `packages/core/src/wirings/credential/define-credential.ts` is a
no-op. Its doc comment says the CLI reads the call by AST, so "the declaration must
be a top-level literal" (`define-credential.ts:4-5`). `type: 'wire'` is per-user and
`type: 'singleton'` is platform-wide (`define-credential.ts:6`).

The inspector finds the call by its identifier (`packages/inspector/src/add/add-credential.ts:27`)
and requires a `type` property. Anything other than `'singleton'` or `'wire'` is a
critical error: "missing or has invalid 'type' property. Must be 'singleton' or
'wire'" (`add-credential.ts:64-68`).

The read path that follows from that type is in
[a credential's read path follows its declared type, never a missing value](a-credential-read-path-follows-its-declared-type-not-absence.md).
This note covers the declaration only: the type is decided where the credential is
declared, and the inspector rejects a declaration whose type is missing or not one of
the two literals.

**What this rules out:** computing a credential's type from a variable or at runtime,
and accepting a declaration whose type is missing or spelled differently.
