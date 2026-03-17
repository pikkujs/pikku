---
"@pikku/cloudflare": patch
---

Reject WebSocket connections on auth failure instead of always returning 101. Failed connections now close with code 1008 and return HTTP 403.
