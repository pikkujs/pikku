---
"@pikku/core": patch
---

Fix body stream caching in PikkuFetchHTTPRequest so that arrayBuffer() can be called after body() has already consumed the stream via text(). This is required for Auth.js CSRF validation to work correctly when integrated with Pikku's internal fetch.
