---
'@pikku/migrator-sql': patch
---

The migrator no longer treats dotfiles as migrations. A tarball packed on macOS carries a binary AppleDouble `._<name>.sql` beside every migration; extracted on Linux it sorted first and was run as SQL, failing `migrate` under Bun's sqlite and being recorded as an applied migration under `node:sqlite`. A migration the database refuses now throws `MigrationFailedError` (`[PKU-DB-MIGRATE]`), which names the file and keeps the driver's error as `cause`.
