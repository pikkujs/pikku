---
'@pikku/cli': minor
'@pikku/deploy': minor
'@pikku/deploy-standalone': minor
---

SQLite extensions now load under bun on macOS. Bun there opens Apple's SQLite, which is built without extension loading, so the CLI points bun at Homebrew's libsqlite3 (`brew install sqlite`) as it starts, or at the one `PIKKU_SQLITE_LIBRARY` names; without one it warns and carries on without extensions. A bun standalone build on macOS embeds that libsqlite3 and opens its database with it, and fails if the build machine has none. Linux is unchanged: bun there brings a SQLite that loads extensions, and node uses `node:sqlite` everywhere.
