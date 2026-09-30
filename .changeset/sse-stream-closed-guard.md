---
'@pikku/core': patch
---

An SSE response stream ignores a send or close after the stream has already closed or the client has gone, instead of throwing `Controller is already closed` and taking the process down.
