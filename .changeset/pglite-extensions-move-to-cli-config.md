---
'@pikku/cli': patch
---

Declare `pgliteExtensions` in pikku.config.json's `db` block rather than in
`createConfig`. It only ever configured the CLI's embedded PGlite databases, and
reading it from the runtime config meant a project pointed at a server through
`DATABASE_URL` lost its declaration — the shadow database the CLI migrates is
PGlite either way, so the extensions went missing exactly where they were needed.
`pikku db export` now picks them up too.

```json
{
  "db": {
    "pgliteExtensions": ["@electric-sql/pglite-pgvector", "hstore"]
  }
}
```
