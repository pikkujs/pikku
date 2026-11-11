---
type: decision
title: The CLI syncs its registry SDK like any consumer
description: The CLI calls the addon registry through the registry's own SDK, which its build syncs into .pikku/remote like any consumer's; only pikku-addons.lock is committed
tags: cli, addons, registry, sdk, build
---

# The CLI syncs its registry SDK like any consumer

The CLI resolves versioned `wireRemoteAddon` packages against the addon
registry, and it calls the registry the way a project calls any hosted addon:
`src/registry.wiring.ts` wires `@pikkustudio/addon-registry@^0.12.0` with
`wireRemoteAddon`, and `pikku all` and `pikku update` call
`registry:resolveSdk`. The request and response types come from the registry's
SDK, not a hand-written client.

**The SDK is never committed, the lock is.** `.pikku` is generated output,
like `dist`. `pikku-addons.lock` is committed, as `bun.lock` is, so every build
fetches the same SDK and checks it against the lock's sha512.

**The build syncs it with the CLI it is building.** `build.sh` bootstraps with
a pinned published CLI, which predates versioned packages: it reads the spec as
an npm package missing from devDependencies (PKU338) and ignores `--config`. So
that stage runs with `src/registry.wiring.ts` moved aside. Its codegen then
does not import the wiring, so `build.sh` appends the import to the bootstrap
by hand. The CLI compiled from that stage can therefore call the registry, and
its `pikku all` (the second stage) syncs the SDK into `.pikku/remote`, the
same way any consumer's would. `.pikku/remote` survives the clean step as a
cache; the lock check decides whether it is reused.

**The registry serves its own SDK** from `api.pikkustudio.app`, so every
build, CI included, syncs it and checks it against the lock.
`PIKKU_CLI_WITHOUT_REGISTRY_SDK=1` still builds without it, for a machine with
no network to the registry. The second stage then also runs with the wiring
hidden and the lock restored afterwards, the wiring import is appended again,
and `remote-addon-sync.ts` types `registry:resolveSdk` from a contract it
mirrors instead of the generated map:

```ts
type RegistryResolveSdk =
  FlattenedRPCMap extends Record<'registry:resolveSdk', infer Contract>
    ? Contract
    : UnsyncedRegistryResolveSdk
```

A CLI built this way still wires and calls the registry at runtime; only the
compile-time types differ.

**Tests** never touch the network or a synced SDK. `remote-addon-sync.test.ts`
syncs the CLI's real `src/registry.wiring.ts` against `test-fixtures/registry-sdk/`,
a cut-down SDK, through a fake registry. It also checks that the committed lock
makes the build ask for exactly the pinned version.

**What this rules out:** a vendored SDK drifting from what the registry serves,
a hand-written registry client, and a release blocked on the registry
publishing its SDK.
