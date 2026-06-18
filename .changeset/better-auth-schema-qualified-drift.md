---
'@pikku/cli': patch
---

Fix a Better Auth schema-drift false positive in `pikku db migrate`. Better
Auth's desired schema uses bare table names (`user`, `account`, …) while
Postgres introspection returns schema-qualified names (`public.user`). The
diff now falls back to matching a bare desired table against a uniquely
schema-qualified introspected table, so a fully-migrated Postgres database no
longer reports every auth table as missing (which aborted the migrate with a
spurious "run `pikku db generate`").
