---
'@pikku/assistant-ui': patch
'@pikku/core': patch
---

Move AG-UI to 0.0.59 with the matching @assistant-ui packages.

**Wire change:** `RUN_FINISHED.usage` is now an array of `{ model?, inputTokens, outputTokens, totalTokens }`, the @ag-ui/core 0.0.59 shape, replacing a top-level `model` plus `usage: { promptTokens, completionTokens, totalTokens }`. AG-UI clients that read the old fields need updating.

AG-UI 1.0 is held back: no release of @assistant-ui/react-ag-ui accepts @ag-ui/client 1.x yet.
