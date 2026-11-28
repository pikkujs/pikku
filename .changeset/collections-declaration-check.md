---
'@pikku/cli': patch
---

A project with a `db/collections.ts` gets a `collections` scope tree from `pikku all`: one node
per collection and one leaf per enabled operation, the write leaves live. The
build fails for a declaration that does not fit `db/tables.ts`, for a check of
the app's own that cannot be loaded, and for any other `collections` scope root.
`pikku validate` warns when a system role holds `collections`, `db/collections.ts` may import
`@pikku/core/collections`, and the `pikku dev` Studio session holds `collections` when the
project has collection functions.
