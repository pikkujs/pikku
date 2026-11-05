---
'@pikku/addon-cloud-cli': patch
---

`pikku cloud` commands (projects, deploy, status, secrets) failed with "RPC function not found" because the CLI sent bare rpc names while production serves the cloud API as `cloud:<name>`. The CLI now takes its rpc names and types from the published `@pikkustudio/addon-cloud-api` contract instead of a stale hand-copied SDK and a hand-kept prefix list. `bun run sync-contract` refreshes `src/contract/` from the registry; a call the contract does not carry is refused with a clear message rather than sent to a 404.
