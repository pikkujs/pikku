---
'@pikku/addon-cloud-cli': patch
---

`pikku cloud` commands call production's current rpc names. The cloud API functions are served under the `cloud:` prefix (and `createSandboxChange` under `machine:`), so bare calls such as `cloudCliProjects` and `listStages` failed with "RPC function not found". `getCloudRPC` now adds the prefix in one place; `requestCliAuth`, `pollCliAuth` and `submitFinding` stay bare.
