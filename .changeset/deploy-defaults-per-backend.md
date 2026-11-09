---
'@pikku/cli': patch
---

`deploy` is the project default for every backend and frontend (`provider`, `target`, `bundler`, `mangleIdentifiers`, `serverlessIncompatible`); a backend or frontend overrides `provider` and `target`, and `grouping` and `embed` are per backend. `pikku deploy plan` and `apply` run once per backend (`--backend` narrows), and a missing provider is an error instead of silently cloudflare. `deploy.defaultProvider`, `defaultTarget`, `grouping` and `embed` at the project level are refused with the new home named. Breaking changes are in docs/MIGRATION.md.
