---
type: decision
title: A remote addon function's contract must be zod
description: In an addon, a remote true function typed with generics or a named source type is critical PKU922, because its contract ships in a types-only SDK
tags: [inspector, addon, sdk]
---

# A remote addon function's contract must be zod

When the package is inspected as an addon (`isAddon`), `addFunctions` checks every
`remote: true` function with `addonZodContractViolation`
(`packages/inspector/src/utils/validate-addon-zod-contract.ts`; the Go port is
`internal/visit/validate_addon_zod.go`). It is critical
`ADDON_REMOTE_CONTRACT_NOT_ZOD` (PKU922) when the function:

- passes type arguments (`pikkuSessionlessFunc<In, Out>`), or
- has no zod `input`/`output` and its inferred type resolves to a named type
  declared in the addon's source, followed through custom aliases. Types from
  `@pikku/core` are allowed.

**Why:** `pikku sdk` ships a remote addon's contract as a types-only SDK that may
import nothing but its own files and `@pikku/core`. A zod schema becomes an inline
custom type. A TypeScript type becomes `import type { X } from '../../../src/...'`,
a path the consumer does not have.

**Scope, and what it rules out:**

- The rule covers only `remote: true`. An addon's other functions keep their
  generics, because the console and admin addons use them throughout and are not
  remote-consumed.
- Outside an addon, generics remain allowed everywhere.
- What it rules out is publishing a remote contract that only type-checks on the
  author's machine.
