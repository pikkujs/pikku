---
'@pikku/core': minor
---

Add workflow run time-travel. A run's durable history (`getRunHistory`) is one row per step attempt with lifecycle timestamps; `buildRunTimeline(history)` explodes those into a flat, chronologically-ordered event stream and `reconstructStateAt(timeline, at)` folds it up to any point — a seq index or a `Date` — to recover what the run "knew" then: per-step status, the accumulated step-result cache, the walked path (via `fromStepName`), and a derived phase. These are pure, transport-independent functions (same fold for Redis/Kysely/in-memory), exported from `@pikku/core/workflow` alongside `reconstructFinalState`. `PikkuWorkflowService` gains `getRunTimeline(id)` and `reconstructRunStateAt(id, at?)` that wrap them over a run's history, inherited by every backend. Correctly handles retries (a retry's created event reopens the step and clears the prior outcome) and graph cycles (revisit ordinals are distinct path entries).
