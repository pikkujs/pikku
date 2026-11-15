---
'@pikku/cli': patch
---

The CLI vault secret client reads over HTTP (`@pikku/fetch`, bearer, `x-pikku-remote-contract`) from a host and token in the file named by `PIKKU_VAULT_CONNECTION_FILE`, re-read once on a 401 or connection error. `PIKKU_VAULT_SOCKET` and `PIKKU_VAULT_TOKEN` are removed. Still read-only. Breaking: see docs/MIGRATION.md.
