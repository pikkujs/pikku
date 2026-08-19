---
'@pikku/kysely': patch
'@pikku/kysely-node-sqlite': patch
'@pikku/kysely-bun-sqlite': patch
'@pikku/cli': patch
---

fix: one coercion plugin, not three

The Kysely coercion plugin existed in three copies — the CLI's local database,
`@pikku/kysely-node-sqlite` and `@pikku/kysely-bun-sqlite` — and all three had
drifted apart. Only the CLI's resolved a column against the tables the query
actually named, so two tables that disagree on the kind of a same-named column
coerced correctly in local development and silently did not at runtime; only
bun's dropped a genuinely ambiguous column instead of letting the last table
processed win.

The single implementation now lives in `@pikku/kysely`, which all three already
depended on, and keeps both behaviours: table-qualified resolution first, an
ambiguity-safe bare-name fallback second.

`ColumnKind` — the value type of the generated `coercion.gen.ts` — is
`'date' | 'bool' | 'json'`. The CLI's fourth member, `uuid`, was never a
coercion kind: the codegen excludes it from the map by construction, because a
UUID is a string in both Postgres and SQLite. It is now `AnnotationKind` in the
CLI, the union a column may declare in `db/annotations.ts`, of which
`ColumnKind` is the coercible subset.

`@pikku/cli` also drops its unused dependency on the Node-only
`@pikku/kysely-node-sqlite`.
