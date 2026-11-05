---
type: decision
title: pikku cloud rpc names and types come from the published cloud API contract, synced by pikku all
description: package.json pikku.uses.cloud makes pikku all fetch @pikkustudio/addon-cloud-api from the registry into the gitignored .pikku, pinned by pikku-addons.lock; nothing generated is committed
tags: cli, cloud, rpc
---

# pikku cloud rpc names and types come from the published cloud API contract

Production serves the cloud API functions as `cloud:<name>` (the controlplane's
`cloud-api.wiring.ts` wires `@pikkustudio/addon-cloud-api` as `cloud`).

The CLI declares that package the way any addon declares a dependency:
`package.json` `pikku.uses: { cloud: "@pikkustudio/addon-cloud-api@^0.0.2" }`.
`pikku all` (the package's `prebuild`) resolves it through the registry
(`POST /rpc/registry:resolveSdk`, a public unauthenticated read), checks the
download against the sha512 in `pikku-addons.lock`, extracts it into
`.pikku/remote/`, and merges it into the addon's generated RPC map as
`cloud:<name>`. `.pikku` is gitignored; only `pikku-addons.lock` is committed.
See the cli note `an-addon-calls-another-through-its-sdk`.

- `src/lib/rpc-client.ts` types `invoke` from that map, with the `cloud:` prefix
  stripped, so callers keep bare names and a name the contract lacks is a
  `tsc` error. At runtime a bare name gets `cloud:` unless
  `contract/uncontracted.ts` says where it is served.
- Four calls are not in the contract and are typed by hand in
  `contract/uncontracted.ts`: `requestCliAuth`, `pollCliAuth`, `submitFinding`
  (served bare, they live in the controlplane's api-functions package),
  `createSandboxChange` (`machine:`, `@pikkustudio/addon-machine-api` publishes no
  SDK), and three aspiration calls (`cloud:`) newer than the published 0.0.2,
  called by pikku-console. Delete an entry once its source publishes a contract.
- `dist/.pikku/remote` is copied by the build so the shipped `.d.ts` resolves.

**Build dependency:** the registry must be reachable the first time a checkout
builds (or after the lock changes); `.pikku/remote` is then a cache checked
against the lock. `tsc` and the tests need the generated `.pikku`; run
`bun run pikku` first. `http.test.ts` says so when the synced contract is missing.

**Refresh:** change the range in `pikku.uses.cloud` if needed, then run
`bun run pikku` (or `pikku update`) and commit the new `pikku-addons.lock`. A
registry package that no longer matches the lock fails the build rather than
falling back to a stale copy.

**Gotcha:** the registry serves the published version, which can trail the
controlplane's working tree; the CLI is typed against what is published.
