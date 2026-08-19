---
'@pikku/core': patch
'@pikku/inspector': patch
---

Follow through on the variable `required` → `optional` rename: regenerate the
core API report and update the inspector's `defineVariable` gating-flag test,
both of which #1369 left describing the deleted `required` flag.
