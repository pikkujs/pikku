---
"@pikku/cli": patch
---

Fix db migration directory detection in validators to use db/sqlite/ and db/postgres/ instead of db/migrations/

Fabric validator now checks db/sqlite/ (Fabric always uses SQLite/libSQL). Workspace validator derives the migrations directory from createConfig — postgresUrl → db/postgres/, sqliteDb → db/sqlite/.
