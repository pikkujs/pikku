---
'@pikku/n8n-import': patch
---

Authenticated n8n HTTP Request nodes (generic header/basic/query + predefined API-key credentials) now map to a runnable `graph:httpRequest` with an auth descriptor resolved at runtime; OAuth2/custom auth stay stubs.
