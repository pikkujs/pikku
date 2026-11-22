---
'@pikku/cli': patch
---

`pikku validate` reports a Vite `/api` dev proxy that does not set `xfwd: true` while the analytics origin lock is on. Without it the proxy sends no `x-forwarded-proto`, the lock assumes `https`, and every analytics beacon from the dev server gets a 403.
