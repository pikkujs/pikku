---
'@pikku/core': patch
'@pikku/cli': patch
'@pikku/better-auth': patch
'@pikku/addon-console': patch
'@pikku/deploy-cloudflare': patch
---

Await previously un-awaited promises (session setters, channel sends, schema compile, trigger and CLI renderer calls) and handle rejections in fire-and-forget timers and signal handlers, found by type-aware `no-floating-promises` / `no-misused-promises`.
