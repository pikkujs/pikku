---
type: decision
title: One identifier per app, on every platform, unique across apps
description: `native.identifier` is the macOS/iOS bundle id and the Android package name at once; it must be Android-safe and no two frontends may share one
tags: [native, tauri, identifier]
---

# One identifier per app, on every platform, unique across apps

Tauri has one `identifier` and uses it for the macOS bundle id, the iOS bundle
id and the Android package name. Pikku keeps it that way: one
`frontends.<name>.native.identifier` per app. Sharing it across platforms is
what lets Apple treat the Mac and iPhone builds as one purchase.

Two different apps must not share one. The OS treats a shared identifier as the
same app — installing the driver app would replace the customer app, and the
two would share a data directory. `pikku app native check` fails on a duplicate.

**Android sets the format.** No hyphens, no segment starting with a digit, no
Java keyword as a segment. macOS additionally rejects an id ending in `.app`.
The default is `com.<scope>.<name>` from the root package's npm scope and the
frontend's name, with hyphens removed — `@acme/*` with frontends `customer` and
`driver` gives `com.acme.customer` and `com.acme.driver`.

**It cannot change after the first store release** — it is the listing's
permanent identity and the key of the app's data directory, so a bundled-server
app that changed it would orphan its local database. Before release it can be
changed in the config and re-applied by `pikku app native init`, which rewrites
`tauri.conf.json`. The identifier is also baked into `gen/android` (as the
Kotlin package path) and `gen/apple`; `check` reports a mismatch there and says
to re-run `tauri android init` / `tauri ios init`, rather than moving package
directories itself.

A staging build that should install beside production needs its own identifier;
that is a future per-environment suffix, not a reason to share one.
