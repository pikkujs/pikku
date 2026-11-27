---
'@pikku/cli': patch
'@pikku/deploy-standalone': patch
'@pikku/deploy-cloudflare': patch
---

Security: the generated standalone, server and container entries no longer overwrite the app's `hostname` with `0.0.0.0`. They listen on `HOST` when it is set, otherwise on the `hostname` from `createConfig`, otherwise on `0.0.0.0`. If your config sets `localhost` or `127.0.0.1` and the app runs in a container, set `HOST=0.0.0.0`.
