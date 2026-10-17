---
'@pikku/inspector': patch
'@pikku/inspector-go': patch
'@pikku/cli': patch
---

Split `inspect()` into `analyzeProgram()` (engine-specific, needs the checker) and `finalizeInspectorState()` (shared, checker-free, served typescript-free from `@pikku/inspector/finalize`). The serialized inspector state now carries every field finalize reads, so a state produced by another engine can be finalized identically.

Add `@pikku/inspector-go`, which runs analysis in the `pikku-inspect` binary over the `--stdin` JSON protocol and finalizes the result, plus a parity harness that diffs it against the TypeScript inspector. The CLI chooses between the two engines as described in the inspector-engine changeset.
