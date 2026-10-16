---
type: decision
title: Analysis and finalize meet at a serialized state
description: Everything that needs the checker runs in analysis and is written into the state as plain data; finalize reads only that data and never loads typescript
tags: [inspector, inspector-go, protocol]
---

# Analysis and finalize meet at a serialized state

`inspect()` in `packages/inspector/src/inspector.ts` is `analyzeProgram()` followed
by `finalizeInspectorState()` (`src/finalize.ts`, exported from the
`@pikku/inspector/finalize` subpath). The boundary between them is
`SerializableInspectorState`: whatever analysis produces must survive
`serializeInspectorState`, JSON and `deserializeInspectorState` unchanged, because
that is the form in which a state arrives from the Go binary.

```decision
chosen: Analysis does every checker read and records the answer as plain data
  in the state. Finalize reads only the state and the options, and its import
  graph never reaches typescript or ts-json-schema-generator.
rules-out:
  - A finalize step that takes a ts.TypeChecker or a ts.Type
  - State that only exists in memory between the two phases
  - Validators that report during analysis what finalize could report
because: The Go engine can only hand over JSON. A checker read left in
  finalize is a read the Go engine cannot answer.
```

## What moved, and why the validators did not

Before the split, finalize-time code asked the checker two things: the keys of
the `SingletonServices` and `Services` types (to aggregate required services) and
which singleton services alias a secret. Both reads moved into
`resolveServiceTypes` (`src/utils/resolve-service-types.ts`), which analysis runs and
stores as `state.serviceTypes = { singletonServices, services, secretAliases }`. It
runs on setup-only passes too, because the CLI reads the singleton names from a
setup-only state when it checks that workflows have a `workflowService`.

Only the reads moved. `validateNoSecretAliasServices` still runs inside the
validation pass, at its original position, reading `serviceTypes.secretAliases`.
The CLI logger discards diagnostics from earlier passes when a validation pass
begins (`beginValidationPass`), so a validator moved out of the pass would have its
messages thrown away on a re-inspection.

`computeContractHashes` and `computeRequiredSchemas` moved from the schema block of
analysis to the top of finalize, in the same order. `applyDeclaredScopes` and two
constants (`AUTH_HANDLER_FUNC_ID`, `DYNAMIC_SCENARIO_STEP_TARGET`) moved to their own
modules so finalize can import them without the compiler.

## The pipe

`pikku-inspect --stdin` reads `{ routeFiles, options }` and writes
`{ protocol: 1, finalized, state, diagnostics, stats }`. The JSON Schemas are in
`protocol/`, the TypeScript types in `src/protocol.ts`.

`options` carries only what analysis reads: `tsconfig`, `rootDir`, `setupOnly`,
`types`, `schemaConfig`, `isAddon`, `tags`, `classificationCheck`, `allow`.
`openAPI`, `manifest`, `modelAliases` and `strictMeta` are read by finalize and stay
on this side. `oldProgram` is a live `ts.Program` and has no meaning to Go.

A diagnostic is `{ level, code?, message }`. A `critical` must carry its
`ErrorCode`; the wrapper replays it as `logger.critical(code, message)`, a coded
error or warning as a tracked `logger.diagnostic`, anything else as a plain log
line.
