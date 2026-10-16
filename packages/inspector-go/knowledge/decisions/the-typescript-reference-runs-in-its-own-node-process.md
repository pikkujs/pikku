---
type: decision
title: Each TypeScript reference inspection runs in its own node process
description: The parity harness and the roundtrip test never run two inspections in one process, and never run the reference under bun
tags: [inspector-go, parity, testing]
---

# Each TypeScript reference inspection runs in its own node process

`parity/ts-run.ts` performs exactly one TypeScript inspection and writes the result
to a file; `parity/run-ts.ts` spawns it under `node`. The harness and
`src/ts-roundtrip.test.ts` both go through it.

Under bun, once the schema pass has imported a project's sources (zod schemas are
loaded by importing the files), `require.resolve` stops finding addons' exported
metadata such as `@pikku/addon-console/.pikku/function/pikku-functions-meta-verbose.gen.json`.
Within that same process, finalize's `loadAddonSchemas` then loads nothing, and a
second inspection loads no addons at all. Under node the same sequence resolves
every time. The CLI runs on node, so node is the honest reference.

```decision
chosen: One inspection per process, and the reference process is node.
rules-out:
  - Running the TypeScript reference in the bun test process
  - Comparing two inspections made in the same process
because: Under bun the reference itself is wrong for any project that wires
  an addon, and the error looks exactly like a parity difference.
```

> [!WARNING]
> Any test that runs `analyzeProgram` with a `schemaConfig` in-process under bun
> poisons addon resolution for whatever runs after it in that process. Use the
> stand-in binary (`parity/ts-reference-bin.ts`) instead, as `src/protocol.test.ts`
> does.
