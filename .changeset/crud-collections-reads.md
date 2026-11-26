---
'@pikku/cli': patch
---

A project with `db/crud.ts` gets generated CRUD functions: `describeCrud`, and a list and a get for each collection. They are exposed Pikku functions over the app's own Kysely, each needing the collection's `crud:<collection>:read` scope and the app's read check. Lists take only the filters, sorts and search columns the collection declares, and rows carry only declared columns. `describeCrud` reads the caller's grants again on every call, so a project's `scopeService` is required.
