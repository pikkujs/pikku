---
'@pikku/inspector': patch
'@pikku/cli': patch
---

fix(inspector): register functions in a dedicated pass before wiring resolution

The deterministic-codegen change sorted `program.getSourceFiles()` so generated
output is byte-identical across runs. But function registration (`addFunctions`)
ran in the same sweep as wiring resolution (`visitRoutes`), so once traversal
became alphabetical, a wiring file could be visited before the file that defines
the function it references — e.g. an addon contract (`hello.contracts.ts`)
before `hello.functions.ts` — producing a spurious `PKU559` ("No function
metadata found for channel handler").

Function registration now runs in its own pass (`visitFunctions`) over the
sorted files, completing before any transport/wiring resolution, so resolution
no longer depends on source-file order. Also sort the `register.gen.ts` schema
imports (driven by a `Set`) so that file is stable too, and opt the PII-check
tests into the now-opt-in classification scan.
