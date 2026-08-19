---
'@pikku/kysely-postgres': patch
---

the Postgres run lock is now a session advisory lock, so a long workflow body no longer parks its connection `idle in transaction`
