---
'@pikku/cli': patch
---

`pikku db generate` now writes a migration for a required column its source stopped writing. A column that is NOT NULL with no default and no longer in the source's schema fails every insert into its table, yet counted as "already covered" because nothing was missing. Better Auth 1.7.0–1.7.2 required `account.issuer` and 1.7.3 stopped writing it, which broke sign-in for every project that had generated the column. PostgreSQL gets `ALTER COLUMN … DROP NOT NULL`; SQLite, which cannot change a constraint, gets `DROP INDEX` for any index on the column and then `DROP COLUMN`.
