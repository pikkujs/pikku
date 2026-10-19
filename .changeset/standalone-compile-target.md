---
'@pikku/deploy-standalone': patch
---

`pikku deploy apply -p standalone` cross-compiles when `PIKKU_COMPILE_TARGET` is set (for example `bun-linux-arm64`), passing it to `bun build --compile --target`.
