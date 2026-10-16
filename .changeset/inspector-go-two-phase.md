---
'@pikku/inspector': patch
---

Split `inspect()` into `analyzeProgram()` (engine-specific, needs the checker) and `finalizeInspectorState()` (shared, checker-free, served typescript-free from `@pikku/inspector/finalize`). The serialized inspector state now carries every field finalize reads, so a state produced by another engine can be finalized identically.
