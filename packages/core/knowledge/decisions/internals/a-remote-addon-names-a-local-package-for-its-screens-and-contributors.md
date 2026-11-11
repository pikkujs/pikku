---
type: decision
title: A remote addon names a local package for its screens and contributors
description: wireRemoteAddon accepts local (and no uses), a build-time pointer to an installed package that supplies the screens and contributors shown under the same name; the contract package and the local package stay separate
tags: core, inspector, addons, remote, ui, contributors
---

# A remote addon names a local package for its screens and contributors

**Why.** An app that talks to a hosted service and also ships screens and
contributors for it ended up with two registrations, one `wireRemoteAddon` for
the contract and one `wireAddon` under another name for the local half. One name
should address both.

**No `uses` on a remote addon, on purpose.** The remote server never calls
another addon, so a mapping of what it may call means nothing. It was added so
cloud-stamped local screens could call `studio:*`, which is not a remote addon's
business. A remote addon reaches only itself (`addonMayReach` and `mapAddonCall`
see no `uses` on its entry).

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
