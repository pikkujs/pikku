---
'@pikku/cli': patch
'@pikku/deploy': patch
'@pikku/deploy-standalone': patch
---

`pikku deploy apply` now exits non-zero when the deploy fails, and `--fromPlan` works for providers that write no `infra.json`, such as standalone. `deploy plan` stages `deploy.embed`, so a plan applied later carries the same files. `deploy.defaultProvider` now takes effect when `-p` is not given. `deploy apply --runtime` is a real option, refused unless the provider supports that runtime.
