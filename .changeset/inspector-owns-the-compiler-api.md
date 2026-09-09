---
'@pikku/inspector': patch
'@pikku/cli': patch
---

The CLI's own code no longer imports the TypeScript compiler API. `collectSurface` moved out of `@pikku/cli` into a new `@pikku/inspector/surface` entry point, and the two smaller compiler needs the CLI had are exposed as `readModuleSpecifiers` and `readTsconfigOutDir`.

`typescript` drops to a devDependency on `@pikku/cli`. It still arrives transitively through `@pikku/code-edit`, which needs a parser to rewrite your source and is loaded only by `pikku meta apply` and the console's edit RPCs.
