---
type: decision
title: pikku cloud rpc names and types come from the published cloud API contract, synced by pikku all
description: the CLI wires @pikkustudio/addon-cloud-api as cloudApi, the addon declares it in pikku.uses.cloud, and pikku all syncs and pins it; every call names its served function, typed from the synced map
tags: cli, cloud, rpc
---

# pikku cloud rpc names and types come from the published cloud API contract

Production serves the cloud API functions as `cloud:<name>` (the controlplane's
`cloud-api.wiring.ts` wires `@pikkustudio/addon-cloud-api` as `cloud`).

The contract reaches the build the way any addon dependency does, through the
CLI's own sync, not a script:

- `packages/cli/src/cloud-api.wiring.ts` wires `@pikkustudio/addon-cloud-api@^0.0.2`
  with `wireRemoteAddon` as `cloudApi` (the name `cloud` is the addon's own
  namespace), served under `cloud:`; `cli.wiring.ts` maps it with
  `wireAddon({ name: 'cloudCli', package: '@pikku/addon-cloud-cli', uses: { cloud: 'cloudApi' } })`,
  which is what PKU348 checks. The addon is mounted as `cloudCli`, not `cloud`:
  an addon's own namespace wins over its `uses`, so with the mount equal to the
  alias, `cloud:<fn>` resolved to the addon itself and never reached `cloudApi`.
  `wireAddon` now throws on that shape. The `pikku cloud` command is unaffected
  (it is the literal key in `cli.wiring.ts`, which refs `cloudCli:cloudCommands`).
- `packages/addon/pikku-cloud-cli/package.json` declares
  `pikku.uses.cloud = "@pikkustudio/addon-cloud-api@^0.0.2"`.
- `pikku all` (`runAddonSync`) resolves it through the registry
  (`registry:resolveSdk`, a public read), checks the sha512 in the committed
  `pikku-addons.lock` (one in the CLI, one in the addon), extracts it into the
  gitignored `.pikku/remote`, and merges it into the addon's generated RPC map as
  `cloud:<name>`. Nothing generated is committed. The alias `cloud` does not
  collide with the addon's own functions: those are unprefixed in that map, and
  the mount is `cloudCli`.
- `src/lib/rpc-client.ts` types `invoke` from that map's `cloud:` keys plus
  `contract/uncontracted.ts`; the name is sent as written. A name the contract
  lacks is a `tsc` error. `build.sh` hides `cloud-api.wiring.ts` from the
  bootstrap stage with `registry.wiring.ts`, because the pinned CLI predates
  versioned packages.
- `uncontracted.ts` hand-types what no contract carries: `requestCliAuth`,
  `pollCliAuth`, `submitFinding` (bare, controlplane api-functions),
  `machine:createSandboxChange` (`addon-machine-api` publishes no SDK). Delete an entry once its source publishes a contract.

The lock's integrity is the pin; there is no separate contractHash.

**Build dependency:** the registry must be reachable the first time a checkout
builds or when a lock changes. Failure is a build error from `pikku all`, never a
stale copy. `tsc` and the tests need the addon's generated `.pikku`; run
`bun run pikku` in the package first.

**Refresh:** bump the range in `cloud-api.wiring.ts` and `pikku.uses.cloud`, run
`pikku update`, commit both `pikku-addons.lock` files.

**Gotcha:** the registry serves the published version, which can trail the
controlplane's working tree; the CLI is typed against what is published.
