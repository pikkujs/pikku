---
'@pikku/addon-cloud-cli': patch
---

`pikku cloud` takes its rpc names and types from the published `@pikkustudio/addon-cloud-api` contract instead of a stale hand-copied SDK and a hand-kept prefix list. `bun run sync-contract` refreshes `src/contract/` from the registry; a call the contract does not carry is refused rather than sent to a 404.
