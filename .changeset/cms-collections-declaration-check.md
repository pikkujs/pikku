---
'@pikku/cli': patch
---

A project with a `db/cms.ts` gets a `cms` scope tree from `pikku all`: one node
per collection and one leaf per enabled operation, the write leaves live. The
build fails for a declaration that does not fit `db/tables.ts`, for a check of
the app's own that cannot be loaded, and for any other `cms` scope root.
`pikku validate` warns when a system role holds `cms`, `db/cms.ts` may import
`@pikku/core/cms`, and the `pikku dev` Studio session holds `cms` when the
project has CMS functions.
