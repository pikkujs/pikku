---
type: decision
title: After cutover @pikku/inspector keeps only its TypeScript-free parts
description: Deferred until TypeScript 7 has a compiler API. When the TypeScript engine is retired, @pikku/inspector keeps state types, ErrorCode, serialization and the other pure helpers, with no typescript dependency
tags: [inspector, inspector-go, packaging]
---

# After cutover @pikku/inspector keeps only its TypeScript-free parts

> [!NOTE]
> Deferred. [Both engines stay, behind a switch, until TypeScript 7 has a compiler API](both-engines-stay-behind-a-switch-until-typescript-7.md),
> so nothing below is removed yet. This is the plan for the day the TypeScript
> engine is retired.

Once the TypeScript engine is retired:

- `@pikku/inspector` keeps the pure pieces: the state and meta types, `ErrorCode`,
  `serializeInspectorState` / `deserializeInspectorState`, the workflow-graph types
  and helpers, and the codegen helpers listed below. Its `typescript` and
  `ts-json-schema-generator` dependencies are removed.
- The analysis lives in the `pikku-inspect` binary, shipped as
  `@pikku/inspector-go` plus one `@pikku/inspector-go-<platform>-<arch>` package per
  platform, installed through `optionalDependencies` the way esbuild ships its
  binary. `PIKKU_INSPECTOR_GO_BIN` or the package's own `bin/pikku-inspect`
  override it in development.
- `InspectorState.typesLookup` and `InspectorState.program`, and
  `InspectorOptions.oldProgram`, are removed: they hold live compiler objects.

```decision
chosen: @pikku/inspector becomes a pure TypeScript package of types and data
  helpers; everything that needs a compiler is answered by the Go binary.
rules-out:
  - Keeping typescript as a dependency for one or two helpers
  - CLI code that walks a ts.Type or a ts.SourceFile
because: A single helper that needs the compiler keeps the whole
  typescript dependency, and its startup cost, in every install.
```

## Every export today, and where it goes

Checked by following each export's import graph to `typescript` or
`ts-json-schema-generator`, then reading the function itself.

**Needs the compiler, must be ported to Go** (or answered by the binary):

| Export                                      | Where it is used                                                        | Note                                                   |
| ------------------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------ |
| `inspect`, `analyzeProgram`                 | CLI `services.ts`                                                       | the analysis itself                                    |
| `generateAllSchemas` (`./schema-generator`) | inside analysis                                                         | ts-json-schema-generator and zod imports               |
| `collectSurface` (`./surface`)              | CLI `surface/build-surface-doc.ts`                                      | walks source files                                     |
| `readModuleSpecifiers`                      | CLI `validate/core-import-checks.ts`, `validate/pikku-barrel-checks.ts` | parses a file for its imports                          |
| `readJsxLiteralText`                        | CLI `validate/component-checks.ts`, `validate/block-checks.ts`          | parses TSX                                             |
| `readTsconfigOutDir`                        | CLI `commands/dist.ts`                                                  | follows `extends` through the compiler's config parser |
| `resolveCoreType`                           | no consumer outside the inspector                                       | takes a `ts.Type`; delete, `serviceTypes` replaces it  |

The CLI also imports `typescript` directly in `src/functions/mocks/stub-scan.ts`.

**Pure, stays TypeScript:**

| Export                                                                               | Note                                                                                                                                                                    |
| ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ErrorCode` and the diagnostic types                                                 |                                                                                                                                                                         |
| `serializeInspectorState`, `deserializeInspectorState`, `SerializableInspectorState` | the protocol's state format                                                                                                                                             |
| `SCENARIO_INSTRUMENTATION_FUNCTIONS`, `isScenarioInstrumentationFunction`            |                                                                                                                                                                         |
| `incompatibleServicesFor`, `resolveDeployTarget`                                     |                                                                                                                                                                         |
| `generateCustomTypes`, `sanitizeTypeName`                                            | codegen over `TypesMap` data                                                                                                                                            |
| `unresolvedSchemaReferences`                                                         |                                                                                                                                                                         |
| `createEmptyManifest`, `serializeManifest`, version-manifest types                   |                                                                                                                                                                         |
| `serializeMCPJson`                                                                   |                                                                                                                                                                         |
| `getFilesAndMethods`, `resolveFunctionMeta`                                          |                                                                                                                                                                         |
| `addonResolutionDirs`, `createAddonResolver`                                         | node module resolution only                                                                                                                                             |
| `TypesMap` and every state and meta type                                             | minus `typesLookup`, `program`, `oldProgram`                                                                                                                            |
| `./workflow-graph`                                                                   | graph types and helpers                                                                                                                                                 |
| `getInitialInspectorState`                                                           | pure, but defined in `inspector.ts`, which imports `typescript`; move it out                                                                                            |
| `AUTH_HANDLER_FUNC_ID`                                                               | pure; `index.ts` re-exports it through `add/add-auth.ts`, which imports `typescript`; point it at `utils/inspector-constants.ts`                                        |
| `filterInspectorState`                                                               | pure, but imports `makeContextBasedId` from `utils/extract-function-name.ts`, which imports `typescript`; split that helper out                                         |
| `deserializeDslWorkflow`, `deserializeGraphWorkflow`, `deserializeAllDslWorkflows`   | pure, but `index.ts` takes them from `workflow/dsl/index.ts`, which also exports the compiler-based `extractDSLWorkflow`; import `deserialize-dsl-workflow.ts` directly |
| `finalizeInspectorState` (`./finalize`)                                              | the TypeScript engine's finalize; the Go binary runs its own, so it goes with the engine                                                                                |

> [!IMPORTANT]
> The last four pure rows load `typescript` today through a shared module. Each
> needs a one-line import change or a small split before the dependency can go.
