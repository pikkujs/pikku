---
type: decision
title: pikku validate warns when a better-auth config does not enable cookieCache
description: The validator warns when a pikkuBetterAuth config has no enabled session cookieCache, since the full better-auth server is then bundled into every unit
tags: cli, validate, better-auth, bundles
---

# pikku validate warns when a better-auth config does not enable cookieCache

The validator in `packages/cli/src/functions/validate/project-checks.ts` reads each function's `src` files
(`validate.function.ts:1244-1259`). The comment explains that without `session.cookieCache` the CLI wires the
stateful session bridge globally, which bundles the full better-auth server into every non-auth unit, and that
enabling it splits out a lean stateless session (`validate.function.ts:1237-1243`).

A file that calls `pikkuBetterAuth(` and `betterAuth(` is flagged when it has no `cookieCache`, or has
`cookieCache` with `enabled: false` (`validate.function.ts:1260-1268`). It then emits the warning
`better-auth-stateless-session-disabled` with a suggested config (`validate.function.ts:1269-1274`).

**What this rules out:** a better-auth config without an enabled cookie cache passing validation without a note.
