---
type: decision
title: An addon grant of BETTER_AUTH_SECRET counts as declared in a project with auth, before auth-secrets.gen.ts exists
description: validateSecretOverrides treats BETTER_AUTH_SECRET as a declared secret whenever the project has a pikkuBetterAuth definition, the same fallback validateSecretUsage takes, so the first inspection of a clean checkout does not report PKU124 for a grant or override naming it
tags: inspector, inspector-go, addon, auth, secrets, validation
---

# An addon grant of BETTER_AUTH_SECRET counts as declared in a project with auth, before auth-secrets.gen.ts exists

`BETTER_AUTH_SECRET` is declared by a `defineSecret` in the generated `auth-secrets.gen.ts`
(see the CLI's "BETTER_AUTH_SECRET is always declared as a required secret"). That file is
written by codegen after the first inspection of a fresh project, so the first pass sees no
declaration for it.

`validateSecretUsage` already allowed for this. `validateSecretOverrides`, which checks an
addon's `secretGrants` and `secretOverrides` against the declared secrets, did not: a
`wireAddon({ secretGrants: ['BETTER_AUTH_SECRET'] })` in a better-auth project had the
first `pikku all` of a clean checkout print critical PKU124 ("Available secrets: none") for a
secret the same build goes on to declare. Anything reading that first inspection's diagnostics
— an editor, a builder driving the inspector, a human reading the log — saw a false error.

Both validators now add `BETTER_AUTH_SECRET` to the declared set when `state.auth.definition`
is present — in `packages/inspector/src/utils/post-process.ts` and in its port,
`packages/inspector-go/internal/finalize/addons.go`.

**What this rules out:** a clean build and an incremental build disagreeing about whether an
addon may be lent the session-signing secret. A project with no `pikkuBetterAuth` still gets
PKU124 for that grant, because nothing will ever declare the secret.

The `db-schema` verifier wires its addon with this grant, generates from a clean `.pikku`, and
asserts the build printed no PKU124.
