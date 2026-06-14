---
"@pikku/cli": patch
---

feat(db): source column classification + type info from `db/annotations.ts`

`db/annotations.ts` is now the single source of column classification and type
overrides. SQL-comment annotations (`-- @private`, `-- @date`, etc.) and
name-based kind inference are removed — they were ambiguous and, for the
sidecar, never actually wired up.

- `ColumnEntry` now exposes `kind` (`date`/`bool`/`json`/`uuid`) and `tsType`.
  `tsType` is a general type override (not json-only) and wins over `kind`.
- New `kind: 'uuid'` types a column as a transparent `Uuid` alias (structurally
  a string) and makes the zod codegen emit `z.uuid()`. Postgres native `uuid`
  columns are detected automatically (no annotation); SQLite has no native uuid
  type, so use `kind: 'uuid'`.
- **Dialect-aware typing**: on Postgres, real temporal columns auto-type as
  `Date` from the introspected type (no annotation needed). On SQLite — which
  stores dates as TEXT — columns stay `string` unless `kind: 'date'` is set.
- The codegen **warns (does not force)** on a name↔type contradiction the real
  type can prove, e.g. a `*_at` column that is actually `boolean` in Postgres.
- Fixed two reasons the `annotations.ts` pipeline never worked: the sidecar was
  written to `.pikku/db/` but read from `db/` (now written beside the authored
  file in `db/`), and the `node --import tsx/esm` compile step silently fails on
  Node ≥ 23 (`ERR_REQUIRE_CYCLE_MODULE`) — replaced with an in-process esbuild +
  `vm` transpile. The sidecar is now compiled **before** codegen, so authored
  edits apply in a single `pikku db migrate` instead of one run behind.
