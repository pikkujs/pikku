---
type: decision
title: The TypeScript inspector engine is retired; pikku-inspect is the only engine
description: The Go binary does all analysis and finalize, @pikku/inspector keeps only its TypeScript-free parts and depends on no typescript package, and there is no engine switch or parity harness
tags: [inspector, inspector-go, cli, typescript]
---

# The TypeScript inspector engine is retired; pikku-inspect is the only engine

Decided 2026-11-06. `pikku-inspect` (built on typescript-go) does all analysis
and finalize. `@pikku/inspector` is the shape of the state it produces and the
data helpers that read it, with no `typescript`, `ts-json-schema-generator`, `zod`
or `tsx` dependency.

```decision
chosen: One engine. The `--inspector` flag, the PIKKU_INSPECTOR variable, the
  `inspector` key in pikku.config.json, `pikku inspector parity` and
  `pikku experiment native-comparison` are gone. A CLI with no pikku-inspect
  binary for its platform fails at inspection, naming the binary and
  PIKKU_INSPECTOR_GO_BIN; it does not fall back.
rules-out:
  - An engine switch, or a second engine kept as a reference for a diff
  - typescript as a dependency of @pikku/inspector, @pikku/code-edit or
    @pikku/n8n-import
  - Compiler objects in the state: InspectorState has no typesLookup, program
    or oldProgram, and InspectorOptions has no oldProgram or sourceFile
  - Waiting for a TypeScript 7 compiler API that has createSourceFile
because: The Go engine is several times faster and uses far less memory, passes
  every verifier and template build, and implements the checks the TypeScript
  engine had (PKU953/PKU954 included). Keeping the TypeScript engine meant every
  inspector change landed twice and a TypeScript 6 compiler stayed in the
  install of every consumer.
```

## What moved

- The source scans and edits `@pikku/code-edit` and `@pikku/n8n-import` used the
  compiler API for are helpers of the binary (`readSyntaxErrors`,
  `scanMessageUsage`, `readJsxProps`, `writeJsxProp`, `writeJsxStyle`,
  `findPikkuCall`, `readImports`, the `scan*` source checks,
  `findWireRemoteAddonLiterals`), and type-checking is `typeDiagnostics` over a
  long-lived `pikku-inspect serve` (`InspectorSession`).
- `zodToTypeText` and `findZodTransform` live in `src/vendor/` here. The Node
  fallback for schemas QuickJS cannot convert (`scripts/vendor-schemas.mjs`)
  resolves them, `tsx` and `zod` from this package, not from `@pikku/inspector`.
- `@pikku/inspector` keeps the state and meta types, `ErrorCode`, the
  serializers, the workflow-graph helpers, the surface types and the pure
  codegen helpers. `./surface` exports the surface types only.

## What was given up

- The TypeScript engine's own unit tests (the visitors under `add/`, the
  schema generator, finalize) were deleted with it. What holds the Go engine now
  is its goldens (`testdata/*/inspect.golden.json`), the Go tests, and the
  verifiers and template builds.
- The parity harness and the TypeScript reference runner. A change that used to be
  proved identical across two engines is now proved by a verifier that fails
  before it and passes after.
- `ErrorCode` entries are checked for an emission site in the Go source and the
  embedded JavaScript as well as TypeScript (`error-codes-emitted.test.ts`).

## Not matched

Syntax-error recovery in the Go parser is checked against TypeScript 6 only on a
few hand-written broken files, and the type-check service rebuilds a program per
call from a parsed-file cache where TypeScript 6 kept live language-service
projects. Neither has been measured on a large project.
