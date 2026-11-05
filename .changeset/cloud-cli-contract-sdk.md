---
'@pikku/addon-cloud-cli': patch
---

`pikku cloud` takes its rpc names and types from the published `@pikkustudio/addon-cloud-api` contract instead of a stale hand-copied SDK and a hand-kept prefix list. The build fetches it from the registry into the gitignored `.pikku/contract`, pinned by `contract.lock.json`, so a name the contract lacks is a type error.
