---
'@pikku/console': patch
---

feat(console): export `DatabasePage` from the package root

Every other console screen a host app can mount is re-exported from
`src/index.ts` — `FunctionsPage`, `ApisPage`, `RuntimePage`, `SecretsPage` and
the rest. `DatabasePage` was not, and the package's `exports` map has no
`./pages/*` subpath, so a host had no way to reach it at all. The screen was
mountable only by the console's own router.

That gap is why an embedding console ends up reimplementing the database canvas
rather than mounting this one, and the reimplementation loses what only this
page has: the per-column classification icons (public, private, pii, secret),
the classification filter, and the table search. The data behind them needs no
new plumbing — `DbSchemaService` already merges `db/annotations.gen.json` over
`db/pikku-db-schema.gen.json`, and `console:getDbSchema` already carries the
merged result.

Export only; the page itself is unchanged.
