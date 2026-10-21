---
'@pikku/cli': patch
---

A standalone bun build cross-compiled with `PIKKU_COMPILE_TARGET` no longer ships the build machine's SQLite libraries. Built on a Mac for `bun-linux-arm64`, the artifact used to carry Homebrew's Mach-O `libsqlite3.*.dylib` (and a darwin `vec0.dylib` when sqlite-vec was loaded) and point bun at it on Linux. The libsqlite3 is now staged only for a macOS target; Linux uses bun's built-in SQLite, which loads extensions. A package extension such as the default `sqlite-vec` now fails a cross build, since only the host's build of it can be found: set `db.sqliteExtensions` to `[]`, or name the target's library file by path. A macOS target on another architecture needs `PIKKU_SQLITE_LIBRARY` to name a libsqlite3 for it. An unreadable `PIKKU_COMPILE_TARGET` is refused.
