---
type: decision
title: The CLI commits its registry SDK
description: The CLI calls the addon registry through the registry's own SDK, and commits that SDK under .pikku/remote with its pikku-addons.lock entry, so syncing it never needs the registry
tags: cli, addons, registry, sdk, build
---

# The CLI commits its registry SDK

The CLI resolves versioned `wireRemoteAddon` packages against the addon
registry. It calls the registry the same way a project calls any hosted addon:
`src/registry.wiring.ts` wires `@pikkustudio/addon-registry@^1.0.0` with
`wireRemoteAddon`, and `pikku all` and `pikku update` call
`rpc.invoke('registry:resolveSdk', …)`. The request and response types come
from the registry's SDK, not from a hand-written copy.

That is circular. Every other project syncs a versioned addon's SDK from the
registry during `pikku all`. The CLI cannot fetch the registry's SDK that way,
because the sync step is the code it is building, and the call it would make is
typed by the SDK it has not fetched yet.

So the CLI commits the SDK:

- the five files under `.pikku/remote/@pikkustudio/addon-registry@1.0.0/`
- their `.integrity` marker
- the `pikku-addons.lock` entry with the tarball's sha512

The root `.gitignore` ignores `.pikku` but un-ignores `packages/cli/.pikku/remote`.
With the lock entry and the marker in place, the sync is a lock hit and reads
only the disk (`checkLockedSdk`). A test proves this: it runs `runAddonSync`
on the CLI package with a `resolveSdk` and a `download` that both throw.

`build.sh` keeps `.pikku/remote` when it cleans `.pikku`. It also leaves the
directory out of both sed passes over the bootstrapped tree. The pinned
bootstrap CLI predates versioned packages. It reads the spec as an npm
package missing from devDependencies (PKU338) and ignores `--config`. So
`build.sh` moves `src/registry.wiring.ts` aside for that stage and restores it
before the local CLI runs.

To move to a new registry SDK, change the range in `src/registry.wiring.ts`,
delete the old directory and the lock entry, and run the CLI's `pikku all`
once with network access. Then commit what it writes.

**What this rules out:** a hand-written registry client and types that drift
from the registry's contract, and a CLI build that needs the registry to be
reachable, or that fails because it isn't.
