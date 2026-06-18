---
'@pikku/cli': patch
---

Fix `pikku deploy plan/apply` failing when `outDir` differs from `rootDir/.pikku`.

`build-pipeline` was hardcoding `pikkuDir = join(projectDir, '.pikku')`, ignoring
the `outDir` config option. Projects that set a custom `outDir` (e.g. a monorepo
where sources live in a sub-package) would get a build error:
`Could not resolve "../../../.pikku/pikku-bootstrap.gen.js"`.

`pikkuDir` now falls back to `join(projectDir, '.pikku')` only when `outDir` is not set.
