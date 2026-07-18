---
'@pikku/n8n-import': patch
---

Expand the `httpAuthRecipe` predefined-credential table from 5 to 31 entries (qdrantApi, stripeApi, githubApi, anthropicApi, …) so more authenticated `httpRequest` nodes emit a runnable `graph:httpRequest`.
