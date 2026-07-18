---
'@pikku/n8n-import': patch
'@pikku/cli': patch
---

Add `@pikku/n8n-import` and the `pikku import n8n <file>` CLI command — converts an n8n workflow JSON export into a Pikku workflow graph, throwing stub functions, an agent (when present), and an integrations manifest. Ships with a coverage harness (`yarn harness`) that runs a corpus of real n8n workflows through parse → codegen → tsc.
