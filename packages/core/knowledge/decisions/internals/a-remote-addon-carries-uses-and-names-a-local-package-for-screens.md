---
type: decision
title: A remote addon carries uses, and names a local package for its screens and contributors
description: wireRemoteAddon accepts uses (stored at runtime, so addonMayReach and mapAddonCall treat it like wireAddon) and local, a build-time pointer to an installed package that supplies the screens and contributors shown under the same name; the contract package and the local package stay separate
tags: core, inspector, addons, remote, ui, contributors
---

# A remote addon carries uses, and names a local package for its screens and contributors

**Why.** An app that talks to a hosted service and also ships screens and
contributors for it ended up with two registrations, one `wireRemoteAddon` for
the contract and one `wireAddon` under another name for the local half. One name
should address both.

**`uses` is a runtime field.** `wireRemoteAddon({ uses })` stores it on the
registry entry exactly as `wireAddon` does, so `addonMayReach` and `mapAddonCall`
(`wirings/addon/addon-reach.ts`) need no change: they read `uses` off the caller's
entry whatever its transport. A remote addon without `uses` still reaches only
itself.

**`local` is build-time only.** `local: { package, ui?, contributors? }` is read
statically by the inspector into the same `wireAddonDeclarations` entry
(`remote: true`, `package` = the contract). It is never stored at runtime,
matching `wireAddon`'s `ui` and `contributors`. `loadAddonFunctionsMeta` loads the
screens manifest and the opted-in contributors from `local.package` and records
them under the one name (`state.addonStudio[name]`,
`state.optedInContributors[name]`). The screens command writes the installed-addon
import path from `local.package`, not the contract package.

**Why not `ui`/`contributors` flat beside `package`.** The remote `package` is a
contract (types only, possibly a downloaded SDK); the screens and contributors
live in a different, installed package. Flat fields would leave "which package
are these read from" implicit. A remote addon's functions, secrets and schemas
are still never loaded locally, and nothing about `local` changes that.

**What this rules out:** reading screens or contributors from the contract
package of a remote addon, and a runtime dependency on `local`.
