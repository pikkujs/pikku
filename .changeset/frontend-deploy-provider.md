---
'@pikku/cli': patch
'@pikku/deploy': patch
'@pikku/deploy-standalone': patch
---

Frontends deploy through their resolved provider unless `deploy: false`. `ProviderAdapter` gains optional `frontends: { kinds, embedded }` and `deployFrontend()`; `standalone` declares `spa` and `static`, embedded. `pikku deploy plan` and `apply` fail before any build when a frontend's provider does not support its `kind`, and a `serve` frontend must use its backend's provider.
