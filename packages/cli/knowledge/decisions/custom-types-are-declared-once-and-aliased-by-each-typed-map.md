---
type: decision
title: Custom types are declared once and each typed map aliases them
description: The custom types are written to one shared outDir file with relative imports, and each typed map re-exports them as one-line aliases rather than through an export-from statement
tags: cli, codegen, types
---

# Custom types are declared once and each typed map aliases them

Every typed map (`rpc` ×3, `http`, `channels`, `queue`, `workflow`,
`scenario-step`, `agent`) used to call `generateCustomTypes` itself, so each
carried the full set of custom type declarations and the import lines that came
with them. Those import lines used absolute paths, and several maps also had a
relative import of the same name from `serializeImportMap`, so a project without
`skipLibCheck` got `TS2300 Duplicate identifier` from the generated maps.

The declarations now live in `customTypesDeclarationFile`
(`<outDir>/pikku-custom-types.gen.d.ts` by default), written by
`writeCustomTypesFile` in `packages/cli/src/utils/custom-types-file.ts`. Its
imports go through `getFileImportRelativePath`, via the `resolveImportPath`
option on `generateCustomTypes`. Every map command writes the file before its
map, so whichever subset of commands runs, the file a map points at exists.

Each map emits `import type * as __PikkuCustomTypes from '…'` followed by one
`export type X = __PikkuCustomTypes.X` per custom type, so every name a map
exported before is still exported by it.

**Rejected: `export type * from` (or `export type { … } from`).** A `.d.ts`
module that contains no export declaration exports every top-level declaration
implicitly. Generated code depends on that: `pikku-rpc.gen.ts` imports
`TypedAgentRun`, which the RPC map declares without `export`. Any re-export
statement switches the implicit exports off and breaks that import.

**What this rules out:** a typed map that declares a custom type body itself,
and an absolute import path anywhere in a typed map or the shared file.
`verifiers/functions/src/tests/custom-types.assert.ts` checks both against a
real generated project.
