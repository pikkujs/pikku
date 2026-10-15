---
type: decision
title: declareScopes lets an app grant a scope whose addon it does not wire
description: defineScope is a no-op read by the CLI, and declareScopes declares scope ids so a grant is valid without wiring the addon that owns the scope tree
tags: core, scopes, addons, codegen
---

# declareScopes lets an app grant a scope whose addon it does not wire

`packages/core/src/wirings/scope/define-scope.ts` has two declaration functions,
both with empty bodies.

`defineScope` is a no-op that "tree-shakes away". The CLI reads the call by AST and
generates a `ScopeId` union, so a function that names an undeclared scope fails to
build (`define-scope.ts:3-6`, `33`).

`declareScopes` takes a list of ids (`define-scope.ts:53`). Its doc comment says it
exists so that an app can grant a scope, in a system role or a function's
`scopes`, whose tree belongs to an addon the app has not wired
(`define-scope.ts:36-42`). Each id declares that node and its ancestors
(`define-scope.ts:44`). When the addon is wired, its own description wins, and the
two calls "never conflict, unlike a second `defineScope` for the same root"
(`define-scope.ts:44-46`).

The example is `declareScopes(['pikku:console'])` (`define-scope.ts:49-51`).

**What this rules out:** declaring the same scope root with `defineScope` in two
places, which the doc says conflicts, and making a grant valid only by wiring the
addon that owns it.
