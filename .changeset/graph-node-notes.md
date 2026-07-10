---
'@pikku/core': patch
'@pikku/inspector': patch
---

feat(workflow-graph): optional non-semantic `notes` on graph nodes and graphs

`pikkuWorkflowGraph` nodes now accept an optional `notes?: string`, and the graph itself an optional `notes?: string[]` (e.g. for imported n8n sticky notes). Notes are documentation only — they are excluded from `graphHash`, so editing a note never marks the workflow as a new version.
