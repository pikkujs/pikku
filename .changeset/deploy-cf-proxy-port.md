---
'@pikku/deploy-cloudflare': patch
---

fix(deploy-cloudflare): use port 8080 for pikku-server-proxy container

Cloudflare Containers default to listening on port 8080 (the value Wrangler
auto-configures and what the runtime exposes to `containerFetch`). The
generated `pikku-server-proxy` was wired to port 4003, so every request
fell through the retry loop and eventually surfaced as a 502 even when the
container was healthy. Aligning the proxy with Cloudflare's default port
fixes the connection.
