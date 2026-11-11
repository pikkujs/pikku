---
type: decision
title: A versioned remote addon is pinned by the range it was resolved for
description: pikku-addons.lock records range, version and integrity per SDK; a locked version that still satisfies the range is kept, files on disk are trusted only through the integrity marker, and a pinned version the registry now serves differently fails closed
tags: cli, addons, remote, registry, lock
---

# A versioned remote addon is pinned by the range it was resolved for

The remote addon sync (`packages/cli/src/utils/remote-addon-sync.ts`) runs only as
the first step of `pikku all`; there is no standalone command, and
`pikku update` never runs it. It writes one
entry per package to `pikku-addons.lock`: the `range` the source asked for, the
`version` it resolved to, and the tarball's `sha512-` integrity. Each extracted
SDK carries that integrity in `.pikku/remote/<name>@<version>/.integrity`.

- **The lock records the range.** The inspector (TS and Go) decides whether an
  SDK is usable with string equality alone: lock range equals the source range,
  marker equals lock integrity, manifest names the package and version. No
  semver in the inspector, and a range edited in source reads as stale until a
  sync runs.
- **A locked version that still satisfies a moved range is kept.** The sync
  only rewrites the recorded range; it does not re-resolve. Upgrading is
  editing the range in the `.ts` file by hand. `pikku update` reports the
  latest SDK and prints the file:line and the new literal, but it never
  rewrites source, not even with `--update`.
- **Matching lock and files means no network.** A pinned version whose files
  are missing is asked for by exact version, and the registry must answer with
  the pinned integrity; otherwise the sync fails with PKU352 and installs
  nothing. Re-publishing a version cannot slip new bytes into a project.
- **The bearer goes to the registry, never to the download URL.** The URL is
  signed and short-lived, and a credential is sent only over https or to
  loopback.
- **Two wirings of one package at different ranges are refused** (PKU353):
  the lock holds one SDK per package.

**What this rules out:** a sync that silently upgrades a committed project, an
offline build that fails because the registry is unreachable, and an SDK on
disk that is trusted because its directory name looks right.
