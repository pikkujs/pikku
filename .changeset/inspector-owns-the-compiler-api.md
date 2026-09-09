---
'@pikku/inspector': patch
'@pikku/cli': patch
---

The inspector is now the only package that drives the TypeScript compiler API. `collectSurface` moved out of `@pikku/cli` into a new `@pikku/inspector/surface` entry point, and the two smaller compiler needs the CLI had are exposed as `readModuleSpecifiers` and `readTsconfigOutDir`.

`@pikku/cli` no longer depends on `typescript` at runtime, so installing it no longer pulls in a second TypeScript.
