---
type: decision
title: A declared scope id never shadows a definition
description: A bare declareScopes id is added only when no definition already holds it, so an addon's richer scope tree is kept
tags: [inspector, scopes]
---

# A declared scope id never shadows a definition

`addDeclareScopes` in `packages/inspector/src/add/add-scope.ts` records each valid id
in `state.scopes.declared` and keeps the first source file for it (lines 164-167).

`applyDeclaredScopes` folds those ids into `state.scopes.definitions` later (lines
178-192). It reuses a root that already exists (lines 181-185). For each further
segment it uses `??=`, so a node that is already there is kept (lines 188-189). The
comments at lines 137-141 and 173-177 say an addon's richer declaration "is never
shadowed by a bare id" and that an id already held "is left alone".

**What this rules out:** a bare `declareScopes` entry overwriting the richer tree an
addon or `defineScope` provided.
