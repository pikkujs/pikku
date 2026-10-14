---
type: decision
title: Personas are declared in exactly one definePersonas call per codebase
description: definePersonas is a no-op declaration that the inspector reads statically, and a second call anywhere in the codebase fails the build
tags: core, inspector, personas, declaration
---

# Personas are declared in exactly one definePersonas call per codebase

`definePersonas` in `packages/core/src/wirings/persona/define-personas.ts` is a no-op
(`define-personas.ts:33`). The CLI reads the call by AST and generates
`personas.gen.json` from it (`define-personas.ts:3-8`). The doc comment states the
rule: "Exactly one `definePersonas(...)` is allowed per codebase, so there is one
place to read the cast from and one place to add to. A second call — even in the
same file — fails the build" (`define-personas.ts:14-16`).

The inspector enforces it. `addPersonas` requires an inline object literal and
refuses anything else (`packages/inspector/src/add/add-personas.ts:154-167`), then
claims the single declaration (`add-personas.ts:175-179`, error
`DUPLICATE_PERSONAS_DEFINITION`). `claimSingleDeclaration` in
`packages/inspector/src/utils/single-declaration.ts` refuses a second call in the
same file or another one (`single-declaration.ts:44-55`). Generated `.gen.ts` files
are exempt and never claim the slot (`single-declaration.ts:40-42`).

**What this rules out:** a second `definePersonas` call, including in the same file,
and splitting the cast across several declarations. The rule is about where a
person adds a persona, so it applies to hand-written files only.

**Related:** [scenario and virtual-user files are named for what they hold](scenarios-live-in-files-named-for-them.md)
