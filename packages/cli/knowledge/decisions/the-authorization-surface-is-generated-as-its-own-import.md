---
type: decision
title: The authorization surface is generated as its own import, not on the function leaf
description: The CLI emits permissions, auth gates and credential definitions in a separate generated file, so writing a function never decides who may call it
tags: cli, codegen, auth, permissions
---

# The authorization surface is generated as its own import, not on the function leaf

`serializeAuthGuards` in `packages/cli/src/functions/wirings/auth/serialize-auth-guards.ts`
generates the file that holds permission, auth gate and credential definitions.
Its header comment says permissions and auth gates used to sit on the function
leaf, "as if writing a function meant deciding who could reach it". They are now
"a separate decision, taken once and reused across wirings, so they are a separate
import" (`serialize-auth-guards.ts:2-6`).

The generated file re-exports `defineCredential` (`serialize-auth-guards.ts:40`)
and defines `pikkuPermission` and `pikkuAuth` (`serialize-auth-guards.ts:79-83`,
`119-123`). It also defines `addGlobalPermission`, which runs before wire-, tag-
and function-level permissions (`serialize-auth-guards.ts:150-161`).

The intersection of required singleton services is derived inside the generated
file, not on the function leaf. The comment says nothing outside a generated leaf
names it (`serialize-auth-guards.ts:42-50`).

**What this rules out:** putting a who-may-call gate inline in a function
definition as the way to decide access, and having each wiring carry its own copy
of the permission and credential definitions.

**Related:** [the pikku auth decisions in core](../../../core/knowledge/decisions/security/index.md)
