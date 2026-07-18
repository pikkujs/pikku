---
'@pikku/n8n-import': patch
---

Convert static n8n `toolHttpRequest`/`httpRequestTool` agent tools into real `pikkuSessionlessFunc` tools performing the configured `fetch` (with `httpAuthRecipe` auth); dynamic-URL or OAuth2 tools stay stubs.
