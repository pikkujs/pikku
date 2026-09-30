---
'@pikku/cli': patch
'@pikku/deploy-cloudflare': patch
'@pikku/deploy-standalone': patch
'@pikku/node-http-server': patch
---

Server (container) entries now run on `@pikku/bun-server` and the generated Dockerfile uses `oven/bun`. The standalone provider is bun-only: the `--runtime` option and the node entry are removed. The remote job inbox is served by the `scaffold.remoteJobs` routes, so `@pikku/node-http-server` no longer carries the `dispatchJobs` / `dispatchSecret` shim.
