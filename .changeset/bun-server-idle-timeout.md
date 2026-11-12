---
'@pikku/bun-server': patch
---

Add an optional `idleTimeout` server config (seconds) passed to `Bun.serve`, so quiet SSE streams are not cut at Bun's 10s default. Unset keeps the current behaviour.
