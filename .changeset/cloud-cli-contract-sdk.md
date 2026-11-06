---
'@pikku/addon-cloud-cli': patch
---

`pikku cloud` takes its rpc names and types from the published `@pikkustudio/addon-cloud-api` contract instead of a stale hand-copied SDK and a hand-kept prefix list. The addon declares it under `pikku.uses.cloud`; `pikku all` syncs it from the registry into `.pikku`, pinned by `pikku-addons.lock`. Calls are typed `cloud:<name>`, so a name the contract lacks is a type error.
