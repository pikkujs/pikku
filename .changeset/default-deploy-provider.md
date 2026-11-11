---
'@pikku/cli': patch
---

A project with no `deploy.provider` now deploys with `standalone` on the `server` target instead of failing. `-p` and the per-backend and per-frontend `deploy` overrides still win. Projects that relied on a cloudflare deploy must set `deploy.provider`.
