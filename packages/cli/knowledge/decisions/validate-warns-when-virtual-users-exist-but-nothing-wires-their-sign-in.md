---
type: decision
title: Validate warns when virtual users are declared but no source wires their sign-in
description: runVirtualUserChecks counts virtual user sign-in as wired only when a pikkuVirtualUser or virtualUser call alongside @pikku/better-auth, or a sign-in/virtual-user route, appears in the project source
tags: cli, validate, virtual-users, sign-in
---

# Validate warns when virtual users are declared but no source wires their sign-in

When virtual users are declared, `runVirtualUserChecks` in `packages/cli/src/functions/validate/virtual-user-checks.ts` adds a `virtual-users-no-virtual-user-sign-in` finding unless `hasVirtualUserSignIn` finds a wiring. The check runs only after the `no-virtual-users` early return.

`hasVirtualUserSignIn` returns true when a source file mentions `@pikku/better-auth` together with a `pikkuVirtualUser(` or `virtualUser(` call, or when any file contains `sign-in/virtual-user`. The regex also matches the deprecated `virtualUser()` alias, which an older library version used (its doc comment says so).

Every finding from `w()` has severity `warn`. The fix text names `pikkuVirtualUser`, says `pikku dev` turns sign-in on and creates the keys itself, and says a deployed stage opts in with `PIKKU_ALLOW_VIRTUAL_USER_SIGN_IN` and is given `VIRTUAL_USER_VERIFY_KEY`.

The shared-module design for virtual user checks, including the warn-only rule for the file as a whole, is in [validate checks virtual users through a shared module](../../../core/knowledge/decisions/internals/validate-checks-virtual-users-through-a-shared-module.md). That note does not cover this sign-in check.

**What this rules out:** making this finding an error, and counting a sign-in as wired from a `virtualUser(` call in a file that never mentions `@pikku/better-auth`.
