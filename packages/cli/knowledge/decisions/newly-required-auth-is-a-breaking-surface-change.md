---
type: decision
title: Adding a session requirement to an existing wiring is a breaking surface change
description: The surface diff marks a removed wiring as breaking, an added one as not breaking, and a modified one as breaking only when it newly requires auth
tags: cli, surface, auth, versioning
---

# Adding a session requirement to an existing wiring is a breaking surface change

`packages/cli/src/utils/surface-diff.ts` compares two surfaces by wiring category and id.

A wiring present before and missing now is recorded as `removed` and `breaking: true`
(`surface-diff.ts:208-216`). A wiring new in the after surface is `added` and not breaking
(`surface-diff.ts:217-225`).

For a wiring present in both whose normalized form changed, the diff sets `closed` when the
before form did not require auth and the after form does (`surface-diff.ts:230-232`). That
value is the `breaking` flag (`surface-diff.ts:237`). The comment says this is the one
wiring-level change that shuts out existing callers outright. `authRequired` checks
`auth === true` (`surface-diff.ts:179-182`).

**What this rules out:** reporting a new auth requirement as a non-breaking modification.
