---
type: decision
title: Validate warns when personas are declared but no source wires actor sign-in
description: runPersonaChecks counts actor sign-in as wired only when a pikkuActor or actor call alongside @pikku/better-auth, or a sign-in/actor route, appears in the project source
tags: cli, validate, personas, sign-in
---

# Validate warns when personas are declared but no source wires actor sign-in

When personas are declared, `runPersonaChecks` adds a `personas-no-actor-sign-in` finding unless `hasActorSignIn` finds a wiring (`packages/cli/src/functions/validate/persona-checks.ts:180-183`). The check runs only after the `no-personas` early return (`:162-178`).

`hasActorSignIn` returns true when a source file mentions `@pikku/better-auth` together with a `pikkuActor(` or `actor(` call, or when any file contains `sign-in/actor` (`:116-126`, with the two tests at `:120-123`). The regex also matches the deprecated `actor()` alias, which an older library version used (doc comment `:112-114`).

Every finding from `w()` has severity `warn` (`:142-149`, severity set at `:148`). The fix text names `pikkuActor` and says a deployed stage opts in with `PIKKU_ALLOW_ACTOR_SIGN_IN` (`:185-194`).

The shared-module design for persona checks, including the warn-only rule for the file as a whole, is in `packages/core/knowledge/decisions/internals/validate-checks-personas-through-a-shared-module.md`. That note does not cover this sign-in check.

**What this rules out:** making this finding an error, and counting a sign-in as wired from an `actor(` call in a file that never mentions `@pikku/better-auth`.
