---
type: decision
title: pikku validate forces the two promise rules to error so an un-awaited webhook verify is caught
description: The validator requires typescript/no-misused-promises and typescript/no-floating-promises at error with type information, because a forgotten await on an async verify helper accepts every request
tags: cli, validate, webhooks, lint
---

# pikku validate forces the two promise rules to error so an un-awaited webhook verify is caught

`packages/cli/src/functions/validate/oxlint-checks.ts` lists `OXLINT_REQUIRED_RULES` as `typescript/no-misused-promises` and `typescript/no-floating-promises` (`oxlint-checks.ts:8-20`). The doc comment gives the reason: webhook verification helpers are async, and an un-awaited call is a truthy Promise, so `if (!verify(sig)) reject()` accepts every request. `tsc` does not flag that form (`oxlint-checks.ts:10-15`).

The generated config sets both rules to `error` with type-aware linting (`oxlint-checks.ts:325-326`).

The validator also raises a finding when a project's config does not enforce them at error. The finding has id `oxlint-rule-missing` and severity `error` (`oxlint-checks.ts:501-506`). Its fix hint says to remove any override that sets the rules to `off` or `warn`, and not to disable the conditionals check (`oxlint-checks.ts:507-512`).

The validator also refuses the easy silencing move. Writing `void verify(...)` only hides the report while the promise is still never awaited, so the hint says to await the call and check its result (`oxlint-checks.ts:332-335`).

**What this rules out:** letting a project lower either rule to `warn` or `off`, or accepting `void` as the fix for a flagged webhook verify call.
