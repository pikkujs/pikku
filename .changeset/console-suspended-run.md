---
'@pikku/console': patch
---

Render a suspended workflow run as its own yellow "waiting to be resumed" state instead of a red error, with distinct copy for `WORKFLOW_SUSPENDED` vs `RPC_NOT_FOUND` and a Suspended run-list filter.
