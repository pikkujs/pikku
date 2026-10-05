---
'@pikku/addon-console': patch
---

The console's list calls (`getAllMeta`, `getFunctionsMeta`, `getWorkflowRuns`, `getWorkflowRunNames`, `getAgentThreads`) take an optional `addon` and then return only the items that add-on contributes, matched on the namespace before the first colon. Without it they return everything, as before.
