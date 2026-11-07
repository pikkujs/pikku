---
type: decision
title: tsc is an alias that picks tsrs or TypeScript 7
description: One private package owns the tsc bin, PIKKU_TSC or one constant chooses the engine, and no script changes
tags: [tsc, tsrs, typescript, tooling]
---

# `tsc` is an alias that picks tsrs or TypeScript 7

Decided 2026-11-07.

```decision
chosen: A private workspace package, `@pikku/tsc`, owns the `tsc` bin and
  depends on both `tsrs` and `@typescript/native` (TypeScript 7). It forwards
  arguments and the exit code to the chosen engine. `PIKKU_TSC=tsrs|ts7`
  chooses per run; `DEFAULT_TSC` in `bin/tsc.mjs` is the default and the one
  place to change it. The root depends on `@pikku/tsc` instead of
  `@typescript/native`.
rules-out:
  - Editing the ~250 `tsc`, `tsc -b` and `tsc --noEmit` scripts to name an engine
  - Aliasing `@typescript/native` to `tsrs` in package.json: tsrs ships a `tsrs`
    bin, not `tsc`, so the name every script calls would stop resolving
  - `tsrs --fast` by default: it may differ from pinned TypeScript behaviour
  - Replacing TypeScript 6: `tsc6` and the `typescript` alias stay, because
    neither native engine ships the compiler API the tests import
because: tsrs is a drop-in for the TypeScript 7 compiler, so the engine is a
  choice about speed and memory and should cost one environment variable.
```

## What was checked

On the 85 workspaces whose `tsc` resolves to the alias, `tsc --noEmit -p <package>`
under each engine on the same tree gave identical diagnostics: 1,018 errors each,
none missing and none added. The 24 recipes and templates that carry their own
`typescript` were run through `scripts/tsc-all.mjs` under each engine: 539
diagnostics, identical. `tsc -b` of `@pikku/core` and `@pikku/schedule` emitted
774 files, identical under both.

## Gotchas

- **Workspaces with their own `typescript` shadow the alias.** A package's own
  `node_modules/.bin` comes before the root's, so inside the 24 `recipes/*` and
  `templates/*` that declare `typescript: ^7.0.2` (their `package.json` is copied
  into a user's app, so it cannot change) a bare `tsc` is TypeScript 7 whatever
  `PIKKU_TSC` says. The root `bun run tsc` leaves them out of its filtered run and
  runs their `tsc` script through the dispatcher in `scripts/tsc-all.mjs`; a
  comparison that runs `tsc` inside them compares TypeScript 7 with itself.
- **`build` is not covered.** The recipes' `build` scripts (`tsc -b`) still run
  the local TypeScript 7.
- **Compare on the same tree.** A plain `tsc` run emits, so running one engine
  after the other type-checks against the first one's output and the second
  appears to pass where the first failed. Use `--noEmit`, or reset `dist`.
- **Switching rebuilds.** The buildinfo records the compiler version, so the
  first `tsc -b` after a switch rebuilds.
- **Exit codes.** With `--noEmit` a type error exits 1 under TypeScript 7 and 2
  under tsrs.
- **Both packages restrict `exports`.** The shim reads each package's `bin`
  field from disk rather than using `require.resolve`.
- **Install without scripts.** A fresh `bun install` runs `better-sqlite3`'s
  build; `bun install --ignore-scripts` is enough for type-checking.
