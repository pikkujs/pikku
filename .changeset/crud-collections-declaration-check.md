---
'@pikku/cli': patch
---

A project with a `db/crud.ts` gets a `crud` scope tree from `pikku all`: one node
per collection and one leaf per enabled operation, the write leaves live. The
build fails for a declaration that does not fit `db/tables.ts`, for a check of
the app's own that cannot be loaded, and for any other `crud` scope root.
`pikku validate` warns when a system role holds `crud`, `db/crud.ts` may import
`@pikku/core/crud`, and the `pikku dev` Studio session holds `crud` when the
project has CRUD functions.
