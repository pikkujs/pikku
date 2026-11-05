---
type: decision
title: pikku cloud rpc names and types come from the published cloud API contract, synced by pikku all
description: package.json pikku.uses.cloud makes pikku all fetch @pikkustudio/addon-cloud-api from the registry into the gitignored .pikku, pinned by pikku-addons.lock; nothing generated is committed
tags: cli, cloud, rpc
---

# pikku cloud rpc names and types come from the published cloud API contract

Production serves the cloud API functions as `cloud:<name>` (the controlplane's
`cloud-api.wiring.ts` wires `@pikkustudio/addon-cloud-api` as `cloud`).

The CLI cannot use `pikku.uses` for this: that route needs a host `wireAddon`
that maps the dependency (PKU348 fails the @pikku/cli build), and the CLI is the
caller, not a host. So `scripts/sync-contract.ts` (the package `prebuild`) does
the equivalent: it resolves the package through the registry
(`POST /rpc/registry:resolveSdk`, a public unauthenticated read), checks the
download's sha512 and contractHash against the committed `contract.lock.json`,
and writes `.pikku/contract/` (rpc map types and the name list). `.pikku` is
gitignored; only `contract.lock.json` is committed. A mismatch fails; it never
falls back to a stale copy.

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
- `dist/.pikku/contract` is copied by the build so the shipped `.d.ts` resolves.

**Build dependency:** the registry must be reachable the first time a checkout
builds (or after the lock changes); when `.pikku/contract/.stamp` matches the
lock the registry is not called. `tsc` and the tests need `.pikku/contract`; run
`bun run sync-contract` first. `http.test.ts` says so when it is missing.

**Refresh:** `bun run sync-contract --update [version]` re-pins to the latest
(or given) published version; commit the new `contract.lock.json`.

**Gotcha:** the registry serves the published version, which can trail the
controlplane's working tree; the CLI is typed against what is published.
