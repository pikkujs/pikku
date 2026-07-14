---
'@pikku/n8n-import': patch
'@pikku/cli': patch
---

feat(n8n-import): fall back to the source filename when a workflow is nameless

~half of real n8n exports carry no `name`, so they all collapsed onto the same
`importedWorkflow` slug. `parseN8n` now takes an optional `nameHint`, and the
`pikku import n8n` CLI passes the source filename (minus extension) — a nameless
`0363_HTTP_Executeworkflow_Automate_Webhook.json` now imports as
`n0363HttpExecuteworkflowAutomateWebhook` instead of `importedWorkflow`. A
present, non-blank `name` in the export always wins.
