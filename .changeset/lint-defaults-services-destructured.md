---
"@pikku/cli": patch
---

Default `servicesNotDestructured` and `wiresNotDestructured` lint rules to `'error'`

Both rules now fail the build by default. A non-destructured `services`/`wire` param hides which services/transports a function uses (defeating tree-shaking) and usually masks a missing type behind a cast that silently drifts. The whole `wire` is never genuinely needed — destructure the transport you use (`{ rpc }`, `{ http }`, `{ channel }`). Projects can override either rule to `'warn'`/`'off'` in `pikku.config.json`.
