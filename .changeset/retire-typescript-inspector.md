---
'@pikku/inspector': patch
'@pikku/inspector-go': patch
'@pikku/cli': patch
'@pikku/code-edit': patch
'@pikku/n8n-import': patch
'@pikku/addon-console': patch
---

The TypeScript inspector engine is retired: `pikku-inspect` (the Go binary built on typescript-go) is the only inspector. No Pikku package depends on TypeScript 6 any more.

- `@pikku/cli`: the `--inspector` flag, the `PIKKU_INSPECTOR` variable, the `inspector` key in `pikku.config.json`, `pikku inspector parity` and `pikku experiment native-comparison` are removed. A CLI with no `pikku-inspect` binary for its platform fails at inspection and names `PIKKU_INSPECTOR_GO_BIN`; it no longer falls back.
- `@pikku/inspector` keeps only its types, `ErrorCode`, serializers and data helpers, and drops its `typescript`, `ts-json-schema-generator`, `zod`, `tsx`, `path-to-regexp` and `openapi-types` dependencies. `inspect`, `analyzeProgram`, `finalizeInspectorState`, `collectSurface`, `readModuleSpecifiers`, `readJsxLiteralText`, `readTsconfigOutDir`, `findWireRemoteAddonSpecs` and the `./lite`, `./finalize` and `./schema-generator` entry points are gone; `InspectorState` has no `typesLookup` or `program`, and `InspectorOptions` has no `oldProgram` or `sourceFile`. `./surface` exports the surface types only.
- `@pikku/inspector-go` gains the helpers that replace the compiler API (`readSyntaxErrors`, `scanMessageUsage`, `readJsxProps`, `writeJsxProp`, `writeJsxStyle`, `findPikkuCall`, `readImports`, `findWireRemoteAddonSpecs`, the `scan*` source checks), an `InspectorSession` for the type-checking `serve` process, and the Zod helpers the Node schema fallback uses. `output.schema.json` lists `stats.filesReused`.
- `@pikku/code-edit` and `@pikku/n8n-import` no longer depend on `typescript`. `TypeScriptService.diagnostics()` is now async and the service has a `dispose()` method; the console's `get-file-diagnostics` awaits it.
