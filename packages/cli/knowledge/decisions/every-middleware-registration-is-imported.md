---
type: decision
title: Every middleware registration under a group is imported, not only the primary one
description: The middleware import serializer collects the primary registration and each additional registration for a group, so a second file's auth gate is not skipped
tags: cli, middleware, codegen, auth
---

# Every middleware registration under a group is imported, not only the primary one

`serializeMiddlewareImports` in `packages/cli/src/functions/wirings/middleware/serialize-middleware-imports.ts`
gathers factories for each group by iterating `registrationsOf(groupMeta)` (`serialize-middleware-imports.ts:42-47`,
`serialize-middleware-imports.ts:17`).

`registrationsOf` returns the primary registration plus `additionalRegistrations` (`serialize-middleware-imports.ts:42-47`).
The comment says a group is keyed by its pattern, and more than one file may register for it. Emitting only
the primary registration left the other file unimported, so its middleware never registered, which for a
session bridge or an auth gate fails open and silently (`serialize-middleware-imports.ts:34-40`).

HTTP and tag factories are collected in `serialize-middleware-imports.ts:59-68`.

**What this rules out:** emitting only the first registration for a group pattern.
