---
type: decision
title: A declared scope id never shadows a definition
description: A bare declareScopes id is added only when no definition already holds it, so an addon's richer scope tree is kept
tags: [inspector, scopes]
---

# A declared scope id never shadows a definition

`addDeclareScopes` in `packages/inspector/src/add/add-scope.ts` records each valid id
in `state.scopes.declared` and keeps the first source file for it (lines 164-167).

`applyDeclaredScopes` in `packages/inspector/src/utils/apply-declared-scopes.ts`
folds those ids into `state.scopes.definitions` during finalize (lines 10-26). It
reuses a root that already exists (lines 15-19). For each further segment it uses
`??=`, so a node that is already there is kept (lines 22-23). The comment at
add-scope.ts line 140 and the doc comment at apply-declared-scopes.ts lines 4-9 say
an addon's richer declaration "is never shadowed by a bare id" and that an id already
held "is left alone". It moved out of `add-scope.ts`, which re-exports it, so the
TypeScript-free finalize can import it without loading the compiler.

**What this rules out:** a bare `declareScopes` entry overwriting the richer tree an
addon or `defineScope` provided.
