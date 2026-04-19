---
'@pikku/cli': patch
'@pikku/deploy-cloudflare': patch
---

Deploy pipeline fixes:

- `deploy apply` now exits with non-zero on deploy failure so CI and shell scripts see the correct status (previously failed deploys reported success).
- `deploy plan --result-file` now writes an artifact for the "nothing to deploy" no-op path so automation always has output to consume.
- Cloudflare adapter rejects `target === 'server'` units during manifest generation (not at deploy time), so plan/bundle fail fast with a Fabric pointer instead of silently producing a non-actionable plan.
- Cloudflare deploy threads `dispatchNamespace` (from `CLOUDFLARE_DISPATCH_NAMESPACE`) through `DeployOptions → uploadWorkersInOrder → deployWorkerBatch → createWorker`, so Workers-for-Platforms setups are no longer forced into the default namespace.
