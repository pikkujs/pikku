---
'@pikku/cli': patch
'@pikku/deploy-cloudflare': patch
'@pikku/deploy-standalone': patch
'@pikku/node-http-server': patch
---

Server (container) entries now run on `@pikku/bun-server` and the generated Dockerfile uses `oven/bun`. The standalone provider defaults to `--runtime bun`. The remote job inbox is served by the `scaffold.remoteJobs` routes, so `@pikku/node-http-server` no longer carries the `dispatchJobs` / `dispatchSecret` shim.
