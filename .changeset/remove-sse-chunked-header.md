---
"@pikku/core": patch
---

Remove explicit Transfer-Encoding and Connection headers from SSE responses. The transport layer handles chunked encoding automatically, and setting it explicitly causes double-encoding behind reverse proxies like Caddy.
