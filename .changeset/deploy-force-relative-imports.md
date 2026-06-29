---
"@pikku/cli": patch
---

fix(deploy): per-unit bootstrap files use relative imports instead of package names

When `pikku all --outDir=.deploy/...` runs for per-unit deploy codegen, generated
bootstrap files now always emit relative imports rather than package-name imports
(e.g. `../../../../packages/functions/src/...` instead of `@perauset/functions/src/...`).

Package-name imports from inside `.deploy/` fail in bun workspace projects because
the deploy directory is not a workspace member, so bun never creates the necessary
symlinks for package resolution from that location.

The new `--force-relative-imports` flag on `pikku all` enables this behaviour and is
passed automatically by the per-unit deploy codegen step.
