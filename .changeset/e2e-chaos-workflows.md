---
---

e2e project only: four DSL chaos workflows, a durable side-effect ledger, and
an opt-in `SQLITE_PATH` that points the SQLite backend at a file so workflow
durability is observable across a restart. The default stays `:memory:`, so the
standard suite is unaffected. No published package changes.
