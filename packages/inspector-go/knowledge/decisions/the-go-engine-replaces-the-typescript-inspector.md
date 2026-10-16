---
type: decision
title: The Go engine replaces the TypeScript inspector, it does not sit beside it
description: Once parity holds, the compiler-API code in @pikku/inspector and its typescript dependency are deleted, and finalize is ported to Go too
tags: [inspector, inspector-go]
---

# The Go engine replaces the TypeScript inspector, it does not sit beside it

`@pikku/inspector-go` runs analysis in the `pikku-inspect` binary (tsgo underneath)
and, for now, finalizes the result with the TypeScript `finalizeInspectorState`. That
is a staging arrangement. The end state is one engine: Go does analysis and finalize,
and the TypeScript compiler-API code in `packages/inspector` goes, along with its
`typescript` and `ts-json-schema-generator` dependencies.

```decision
chosen: Go replaces the TypeScript inspector once the parity harness is clean.
  Finalize is ported to Go as well; the binary then reports finalized true and
  the wrapper skips the TypeScript finalize.
rules-out:
  - Two supported engines with a user-facing choice between them
  - A pikku.config.json key or a CLI flag for the engine
  - Polishing the TypeScript finalize module as a permanent API
because: Keeping both means every inspector change lands twice and every
  behaviour difference is a support question. The TypeScript engine is kept
  only as the reference the Go output is diffed against.
```

## How the cut is made safe

- **Parity is measured, not asserted.** `parity/parity.ts` compares, per project
  under `examples/` and `templates/`, the pre-finalize state, the post-finalize
  state and the diagnostics of each phase, section by section, against the
  TypeScript reference. `allow-list.json` records every accepted difference with a
  reason.
- **The switch is internal.** `PIKKU_INSPECTOR=go|typescript` in
  `packages/cli/src/services.ts` picks the engine, defaulting to TypeScript. It is
  not documented and goes away at cutover.
- **Finalize moves in one step.** The protocol's `finalized` flag lets the binary
  take finalize over without a wrapper change: the binary sends `false` until its
  finalize passes parity, then `true`.

> [!NOTE]
> The split into `analyzeProgram` and `finalizeInspectorState`, and the ts-roundtrip
> test, are staging tools. They prove a state can cross the pipe and come back
> unchanged. Once Go finalizes, neither has a reason to exist.

See [analysis and finalize meet at a serialized state](analysis-and-finalize-meet-at-a-serialized-state.md)
for the boundary, and [after cutover @pikku/inspector keeps only its TypeScript-free parts](after-cutover-inspector-keeps-only-its-typescript-free-parts.md)
for what is left.
