---
type: decision
title: Validate checks the project layout, a warning by default and an error under --strict
description: runProjectLayoutChecks reports a config inside a package, a second pikku.config.json, db/ or emails/ inside a pikkuDirectories package, and #pikku/* resolving to a .pikku other than the one beside the config
tags: cli, validate, layout, strict
---

# Validate checks the project layout, a warning by default and an error under --strict

`runProjectLayoutChecks` in `packages/cli/src/functions/validate/project-layout-checks.ts` runs as the `project-layout` check on every app project (a `pikku.config.json` without `types/application-types.d.ts`). Every finding is `warn`, and `error` when `ValidateOptions.strict` is set, which `pikku validate --strict` passes. It does not read `validate.rules`: the layout is not a per-project choice.

The functions package is found from the project's source directories (the config directory, plus each `pikkuDirectories` entry; resolved against `rootDir`): the nearest directory with a `package.json` at or above each, never above the config. Its name does not matter.

- `layout-config-not-at-root`: the top level is the nearest workspace root above the config, not the git root. Inside this monorepo every project is a workspace member of a git root that holds dozens of them, so the git root would flag them all. A workspace root that has its own `pikku.config.json` is left to `layout-config-duplicate`, and one holding more than one app config is a collection of projects with no single top level, so neither is reported.
- `layout-config-duplicate`: only a file named exactly `pikku.config.json` counts. Generated `pikku.*.json` files, addon configs, `node_modules`, `dist`, `build` and dot-directories (`.pikku`, `.git`, `.deploy`) are skipped.
- `layout-db-in-package` / `layout-emails-in-package`: reported only when the folder is missing at the top level (`<rootDir>/db`, `emailTemplatesDir` or `emails/`), or when `emailTemplatesDir` itself points into the package.
- `layout-pikku-import-not-root`: a `#pikku*` target in the `paths` of the tsconfig that governs the package (its own or the nearest one above it, following relative `extends`) or in its `package.json` `imports` that names a `.pikku` other than `<config dir>/.pikku`. A bare `imports` target is resolved only when it starts with the root package's name; other bare targets are not judged. The form a package below the config should use is in [a-functions-package-below-the-config-maps-pikku-with-tsconfig-paths](a-functions-package-below-the-config-maps-pikku-with-tsconfig-paths.md).

**What this rules out:** comparing the config dir with the git root, a per-project `off` switch for these ids, and counting `pikku.surface.json` or other generated `pikku.*` files as second configs.
