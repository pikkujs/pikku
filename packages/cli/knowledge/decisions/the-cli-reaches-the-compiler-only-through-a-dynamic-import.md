---
type: decision
title: The CLI reaches the TypeScript compiler only through a dynamic import
description: Every command loads the whole CLI graph, so a static import of @pikku/inspector, @pikku/n8n-import, the @pikku/code-edit root or the mocks stub scanner puts typescript on the startup path of pikku --help; those are imported inside the function that needs them, and eager values come from @pikku/inspector/lite
tags: cli, inspector, performance, startup
---

# The CLI reaches the TypeScript compiler only through a dynamic import

The generated CLI entry (`.pikku/cli/pikku-cli.gen.ts`) imports every command's function
module, so whatever those modules import at the top is paid by every invocation, including
`pikku --help`. `typescript` plus `ts-json-schema-generator` was the largest of it — about
120 ms of a ~540 ms `--help` under node.

The compiler is reached through four packages, and the CLI imports each one inside the
function body that needs it:

- `@pikku/inspector` — `inspect`, `filterInspectorState` and `getInitialInspectorState` in
  `getInspectorState` (`src/services.ts`); `readModuleSpecifiers`, `readJsxLiteralText`,
  `readTsconfigOutDir` and `unresolvedSchemaReferences` in their checks and commands.
- `@pikku/code-edit` root (`CodeEditService`, in `meta apply`). Its subpaths
  (`/verify`, `/workspace`, `/brand`, …) do not load the compiler and stay static.
- `@pikku/n8n-import` (in `import n8n`).
- `src/functions/mocks/stub-scan.ts`, which imports `typescript` itself.

Values a module needs eagerly — `ErrorCode` in a module-level map, `generateCustomTypes`,
the serializers — come from `@pikku/inspector/lite`, which `packages/inspector/src/lite.test.ts`
pins as compiler-free. Types may still come from `@pikku/inspector` with `import type`.

`src/startup-imports.test.ts` imports the CLI entry in a fresh process and fails if any
compiler module is in the module cache afterwards.

A literal-string `import('...')` is still followed by `bun build --compile`, so the native
binaries keep working; a computed specifier would not be.

**What this rules out:** a value import of `@pikku/inspector` (or the other three) at the
top of any module the CLI entry reaches. If a value is needed eagerly and is not in `lite`,
it belongs in `lite` once its import closure is shown to be compiler-free.
