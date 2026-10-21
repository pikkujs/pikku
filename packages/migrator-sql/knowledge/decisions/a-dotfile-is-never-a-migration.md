---
type: decision
title: A dotfile in the migrations directory is never a migration
description: migrationFiles keeps names ending in .sql that do not start with a dot, so the AppleDouble ._ files a macOS tarball carries are not applied, listed as pending, or baselined
tags: [migrations, packaging]
---

# A dotfile in the migrations directory is never a migration

`migrationFiles` in `src/sql-migrator.ts` keeps a name only if it ends in
`.sql` and does not start with `.`. `migrate`, `pendingMigrations` and
`baselineMigrations` all read the directory through it, so the rule holds for
`pikku db migrate` and for a standalone bundle alike.

The case that forced it: a tarball packed by macOS `bsdtar` carries an
AppleDouble `._<name>.sql` beside every file with extended attributes. GNU tar
on Linux extracts those as ordinary files. They sort before every real
migration (`.` < `0`) and they are binary, starting with NUL. Bun's sqlite
refuses one with "Query contained no valid SQL statement; likely empty query",
failing the whole migrate. `node:sqlite` reads the leading NUL as the end of
the string, runs nothing, and records `._0001-….sql` as applied, which is a
migration in the history that never was one.

Matching only `._` was rejected: no tool writes a migration whose name starts
with a dot, and an editor's or a sync client's other hidden files would bring
the same failure back under another prefix.

A row already recorded under a dotted name is still drift-checked, because
`assertNoDrift` reads applied rows by name and not through the listing.

**What this rules out:** a migration whose file name starts with a dot.
