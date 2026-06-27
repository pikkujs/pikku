---
'@pikku/core': patch
---

fix(workflow): inline graph runs use the same transition planner as the queue

`continueGraphInline` had its own, weaker graph traversal that couldn't revisit a
node (no cycles) and never recorded `fromStepName`, so an inline-run graph stored
different step state than the same graph run through a queue. It now uses the
shared `planGraphTransitions` planner — inline graphs get joins, cycle revisits
(`node`, `node#1`, …) and step provenance identical to the queued path, and the
duplicate traversal logic is removed.
