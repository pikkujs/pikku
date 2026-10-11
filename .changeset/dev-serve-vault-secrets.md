---
'@pikku/cli': patch
---

`pikku dev` and `pikku serve` read secrets from a vault when `PIKKU_VAULT_SOCKET` and `PIKKU_VAULT_TOKEN` are set, and use the local secret store only when they are not. It is one or the other: with a vault configured, a key the vault does not hold is missing.
