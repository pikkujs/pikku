---
type: decision
title: Virtual users are declared in exactly one defineVirtualUsers call per codebase
description: defineVirtualUsers is a no-op declaration that the inspector reads statically, and a second call anywhere in the codebase fails the build
tags: core, inspector, virtual-users, declaration
---

# Virtual users are declared in exactly one defineVirtualUsers call per codebase

`defineVirtualUsers` in `packages/core/src/wirings/virtual-user/define-virtual-users.ts`
is a no-op (`define-virtual-users.ts:33`). The CLI reads the call by AST and
generates a `VirtualUserId` union and `virtual-users.gen.json` from it
(`define-virtual-users.ts:3-8`). The doc comment states the rule: "Exactly one
`defineVirtualUsers(...)` is allowed per codebase, so there is one place to read the
cast from and one place to add to. A second call — even in the same file — fails
the build" (`define-virtual-users.ts:14-16`).

The inspector enforces it. `addVirtualUsers` requires an inline object literal and
refuses anything else (`packages/inspector/src/add/add-virtual-users.ts:163-170`),
then claims the single declaration (`add-virtual-users.ts:174-181`, error
`DUPLICATE_VIRTUAL_USERS_DEFINITION`). `claimSingleDeclaration` in
`packages/inspector/src/utils/single-declaration.ts` refuses a second call in the
same file or another one (`single-declaration.ts:44-56`). Generated `.gen.ts` files
are exempt and never claim the slot (`single-declaration.ts:40-42`).

**What this rules out:** a second `defineVirtualUsers` call, including in the same
file, and splitting the cast across several declarations. The rule is about where a
person adds a virtual user, so it applies to hand-written files only.

**Related:** [scenario and virtual-user files are named for what they hold](scenarios-live-in-files-named-for-them.md)
