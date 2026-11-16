---
type: decision
title: A functions package below the config maps #pikku/* with tsconfig paths
description: When pikku.config.json sits at the workspace root and the code in packages/functions, #pikku/* is mapped by tsconfig paths in the tsconfig that governs the package, never by package.json imports or a .pikku symlink
tags: cli, validate, layout, imports, tsconfig
---

# A functions package below the config maps #pikku/* with tsconfig paths

Generated output is always `<config dir>/.pikku`. When the config is at the workspace root and the code lives in a package below it (`packages/functions`), that package reaches the output through `compilerOptions.paths` in the tsconfig that governs it: its own `tsconfig.json`, or the nearest one above it (usually the root one, beside `pikku.config.json`):

```json
"paths": {
  "#pikku/*.js": ["./.pikku/*.ts"],
  "#pikku/*": ["./.pikku/*/index.ts"]
}
```

The package's own `package.json` has no `#pikku` entries in `imports`, and there is no `packages/functions/.pikku` symlink. Source keeps importing `#pikku/function`, `#pikku/secrets/pikku-secrets.gen.js` and so on.

Every tool that loads the code honours those paths by the same directory lookup: tsc, bun (runtime and `bun build`), tsx and esbuild, the deploy bundler. This was checked against the starter template with the root tsconfig as the only mapping: `pikku all`, the functions `tsc`, `pikku dev` under bun serving requests, a standalone `pikku deploy plan` bundle, and a node + tsx import of `#pikku/*` all resolve.

`pikku validate` reads the mapping where the compiler does. `pikkuMappingsOf` in `project-layout-checks.ts` collects the package's `imports` and the governing tsconfig's `paths` (following relative `extends`). `layout-pikku-import-not-root` flags any of them that names a `.pikku` other than `<config dir>/.pikku`, which is what a package-level `./.pikku` symlink target is. The Cloud checks `functions-pkg-missing-pikku-import` / `-wildcard-import` accept either form being present.

**What this rules out:**

- `package.json` `imports` reaching the root output. Node refuses an `imports` target that leaves the package (`../../.pikku/*`).
- Making the root output a package the functions package depends on. The workspace root is not something a member can depend on under bun (`workspace:*`, `"."` in `workspaces` and `link:../..` all fail), and a generated `.pikku/package.json` as a workspace member does not exist when `bun install` runs on a fresh clone. `e2e/` maps `imports` through `@pikku/e2e/.pikku/*` only because it is itself a member of this monorepo's workspace; the layout check still accepts that form.
- A committed `.pikku` symlink or a per-package stub tree written by the CLI. Both are a second copy of where the output is.
