---
type: decision
title: A cross-compiled standalone build ships SQLite libraries only for its target, and refuses what it can only find for the host
description: With PIKKU_COMPILE_TARGET set, the bun standalone build stages a libsqlite3 only for a macOS target, refuses package-resolved SQLite extensions when the target differs from the host, and accepts extensions named by path
tags: cli, deploy, standalone, sqlite, bun
---

# A cross-compiled standalone build ships SQLite libraries only for its target, and refuses what it can only find for the host

The standalone bun build carries native SQLite files: the extensions in
`db.sqliteExtensions`, and on macOS a libsqlite3 that `setCustomSQLite` swaps
in, since bun there opens Apple's SQLite, which cannot load extensions. Both
were the build machine's. With `PIKKU_COMPILE_TARGET=bun-linux-arm64` on a Mac,
the Linux binary carried Homebrew's Mach-O `libsqlite3.*.dylib` and a darwin
`vec0.dylib`.

The build now reads the platform from `PIKKU_COMPILE_TARGET` (absent means the
host; an unreadable value is refused rather than guessed) and:

- stages a libsqlite3 only when the target is macOS. Bun on Linux statically
  links a SQLite built with extension loading (checked on bun 1.4.3:
  `sqlite_compileoption_used('OMIT_LOAD_EXTENSION') = 0`), so the entry never
  calls `setCustomSQLite` there. A macOS target on another architecture is
  refused unless `PIKKU_SQLITE_LIBRARY` names one, since the host's would be
  the wrong architecture.
- refuses a package extension (`sqlite-vec`, the default) when the target
  differs from the host, because `getLoadablePath()` only returns the host's
  build. An extension named by path is taken as the project's choice for the
  target and shipped.

**What this rules out:** silently dropping host-only extensions from a cross
build (the app would then fail on its first `vec0` table, far from the cause),
and resolving another platform's extension package (`sqlite-vec-linux-arm64`)
ourselves — each extension package lays its platforms out differently, and the
path form already lets a project supply the right file.
