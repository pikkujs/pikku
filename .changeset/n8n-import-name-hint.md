---
'@pikku/n8n-import': patch
'@pikku/cli': patch
---

`parseN8n` takes an optional `nameHint` and the `pikku import n8n` CLI passes the source filename, so nameless n8n exports no longer all collapse onto the same `importedWorkflow` slug.
