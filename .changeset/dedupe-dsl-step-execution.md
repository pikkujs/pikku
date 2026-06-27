---
'@pikku/core': patch
---

Dedupe DSL step execution: extract a shared `invokeStepRpc` (step RPC + provenance wire, used by both the queue and inline executors) and a shared `runInlineRetryLoop` (the in-process running→result→retry scaffolding, used by inline RPC steps and inline function steps). No behavior change — the inline path stays straight-through O(K); the queue path keeps its suspend/replay model.
