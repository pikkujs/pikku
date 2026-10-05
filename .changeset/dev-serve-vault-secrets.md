---
'@pikku/cli': minor
---

`pikku dev` and `pikku serve` read secrets from a vault when `PIKKU_VAULT_SOCKET` and `PIKKU_VAULT_TOKEN` are set, falling back to the local secret store for keys the vault does not hold.
