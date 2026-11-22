---
'@pikku/cli': patch
'@pikku/deploy-standalone': patch
---

A host with a database keeps workflow runs across a restart. `pikku serve`, a generated local CLI and the standalone entry build the SQLite, Postgres or MySQL workflow service and run service on the project's database, and recover stalled runs on start. A project without a database, or one whose workflow tables are not migrated, keeps the in-memory service.
