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
- **Postgres enum columns auto-type** as a string-literal union (e.g.
  `'admin' | 'user'`) with no annotation — resolved from the column's `udt_name`
  against the introspected enum types — and the zod codegen emits
  `z.enum([...])` (or `z.literal(...)` for a single value). SQLite has no native
  enum type; use `tsType: "'a' | 'b'"` there. Non-`public` Postgres schemas are
  not yet supported by the zod codegen.
- New **`format`** field in `ColumnEntry` (`email`, `url`, `e164`, `ulid`,
  `cuid`/`cuid2`, `nanoid`, `jwt`, `emoji`, `base64`/`base64url`, `ipv4`/`ipv6`,
  `cidrv4`/`cidrv6`, `isoDate`/`isoTime`/`isoDatetime`/`isoDuration`). These are
  zod string-format **validators** — they refine the zod schema (`z.email()`, …)
  but keep the TypeScript type as `string`. A `format` applies only when the
  column's resolved select type is `string`; combining it with a `kind`/`tsType`
  that resolves to a non-string type (e.g. `kind: 'date'`) is ignored with a
  warning. Identical across both dialects (it is annotation-driven, not derived
  from storage).
