---
"@pikku/lambda": patch
---

Fix OPTIONS method comparison to use uppercase, matching the Fetch API Request.method convention. Previously the CORS preflight handler was dead code.
