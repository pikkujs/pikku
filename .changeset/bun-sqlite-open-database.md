---
'@pikku/kysely-bun-sqlite': patch
---

Add `openBunSqliteDatabase`, which opens a `bun:sqlite` database as the `SqliteDatabase` Kysely's `SqliteDialect` binds to.

`createBunSqliteKysely` builds one Kysely over one database, so it cannot express several Kysely instances — differing only in their plugins — sharing a single underlying database. That combination is what lets a plugin-free instance (Better Auth needs unmangled column names) and a CamelCase one address the same tables, and until now an app that needed it had to reach for `better-sqlite3` instead.

Under Bun that fallback is not survivable: `better-sqlite3` ships a Node-ABI addon which Bun cannot load, and rather than throwing it aborts the process with `NAPI FATAL ERROR: Error::New napi_get_last_error_info`. In a `pikku dev --watch` this killed the dev server after codegen but before it ever listened, with no error naming the driver.
