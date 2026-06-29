# DB column annotations — how it works and how to extend it

`pikku db migrate` introspects your database and generates typed artifacts. A
hand-authored `db/annotations.ts` is the **single source** for everything the raw
schema can't tell us: privacy classification, anonymize strategy, and type/zod
refinements. This document explains the pipeline and gives a recipe for each way
you might want to extend it.

## The pipeline

```
db/annotations.ts                     ← you author this (satisfies DbClassificationMap)
   │  compileClassifications()         (local-db.ts: esbuild + vm, in-process)
   ▼
db/annotations.gen.json                ← compiled sidecar (the machine-readable form)
   │  loadAnnotations()                (annotation-parser.ts)
   ▼
AnnotationMap  ── generateSchemaTypes() (db-codegen.ts) ──► .pikku/db/schema.gen.d.ts
                                                            .pikku/db/coercion.gen.ts
                                                            .pikku/db/classification.gen.ts
                                                            .pikku/db/classification-map.gen.d.ts  ← the ColumnEntry type you author against
                                        generateZodTypes()  (zod-codegen.ts) ──► .pikku/db/zod.gen.ts
```

Key files (all under `packages/cli/src/functions/db/`):

| File | Responsibility |
|---|---|
| `annotation-parser.ts` | `ColAnnotation` shape; `loadAnnotations()` reads + validates the sidecar |
| `db-introspector.ts` | dialect-agnostic `ColumnInfo` / `EnumInfo` interfaces |
| `postgres/postgres-introspector.ts`, `sqlite/…` | per-dialect introspection |
| `db-codegen.ts` | `schema.gen.d.ts` typing, coercion map, manifest, **owns snake→Pascal/camel name mapping** |
| `zod-codegen.ts` | parses `schema.gen.d.ts` textually → `zod.gen.ts`; **owns the canonical `ZOD_FORMATS` map** |
| `coercion-plugin.ts` | runtime Kysely plugin; `ColumnKind` + `fromDb()` coercion |

## Two axes: what changes the *type* vs only the *validator*

This distinction drives every extension decision.

- **`kind` / `tsType` / enum / real-PG-type** change the **TypeScript type**
  (`Date`, `Uuid`, `'a' | 'b'`, `string[]`). The zod codegen detects these by
  reading the type string out of `schema.gen.d.ts` — so a new type needs a textual
  signal there (a named alias like `Uuid`, or a recognizable shape like a
  literal union).
- **`format`** leaves the TS type as `string` and only refines the zod
  validator (`z.email()`). There is nothing in `schema.gen.d.ts` to key off, so it
  travels as a **structured hint** from `db-codegen` → `zod-codegen`
  (`CodegenResult.zodFormats`), not via the type string.

When adding something new, first decide which axis it's on. If it changes the
type, it's `kind`/`tsType`/auto-detect. If it's a pure string refinement, it's a
`format`.

## Dialect-awareness

Only auto-detection is dialect-specific, and deliberately so. Postgres has real
`timestamp`/`uuid`/`enum`/`boolean` types, so `realKind()` (db-codegen.ts) and
the enum resolver derive `Date`/`Uuid`/unions/`boolean` with **no annotation**.
SQLite stores everything as TEXT/INTEGER and has none of those native types, so
it stays `string`/`number` unless you set `kind`/`tsType` explicitly. Given the
same explicit annotations, both dialects emit identical types.

---

## Recipe 1 — add a new `format` (string-only zod validator)

Cheapest extension. Example: add `z.guid()` as `format: 'guid'`.

1. **`zod-codegen.ts` — `ZOD_FORMATS`**: add `guid: 'z.guid()'`. This is the
   single source of truth; the token type `ZodFormat` and the `ColumnEntry`
   union both derive from its keys, so nothing else needs the literal list.
2. **Verify the zod method exists** in the installed `zod` version
   (`node -e "const {z}=require('zod'); console.log(typeof z.guid)"`). Formats
   are emitted verbatim — a typo here ships a broken `zod.gen.ts`.
3. That's it for wiring — `annotation-parser` validates against `ZOD_FORMATS`
   automatically, and `db-codegen` emits the union from `Object.keys(ZOD_FORMATS)`.
4. **Test**: add a case to `zod-codegen.test.ts` (`formats` arg) and optionally
   an end-to-end case in `verifiers/classification/src/tests/codegen.assert.ts`.

Note: a format only applies when the column's resolved select type is `string`
(see `emitInterface`'s precedence check). If your format implies a non-string
type, it's a `kind`, not a `format`.

## Recipe 2 — add a new `kind` (changes the TS type)

Example: `kind: 'bigint'` typing a column as `bigint` + `z.bigint()`.

1. **`coercion-plugin.ts` — `ColumnKind`**: add `'bigint'`. If it needs runtime
   coercion (DB returns a string/number you must convert), add a `case` to
   `fromDb()`. If the driver already returns the right JS type, skip coercion
   and exclude it in db-codegen's coercion loop (as `uuid` is excluded).
2. **`annotation-parser.ts` — `loadAnnotations()`**: add `'bigint'` to the
   `ann.kind === …` acceptance list.
3. **`db-codegen.ts`**:
   - `selectBase()` / `insertBase()`: map the kind to its TS base (`'bigint'`).
   - `columnTypeExpression()` public branch: add a `kind === 'bigint'` arm if it
     needs special ColumnType read/write types (like `bool`/`date` do); a plain
     scalar can reuse the `tsType` path.
   - `emitClassificationMap()`: add `'bigint'` to the `kind?` union comment line.
   - If a real Postgres type should auto-derive it, add it to `realKind()`.
4. **`zod-codegen.ts` — `scalarSchema()`**: add a `case 'bigint': schema =
   'z.bigint()'`. If the type is a **named alias** (the `Uuid` pattern), also
   emit `export type Bigint = …` in `db-codegen`'s schema header so the textual
   parser can see it.
5. **Tests**: `zod-codegen.test.ts` + both verifier harnesses.

The `Uuid` alias is the template for "a distinct type that's structurally a
primitive": `export type Uuid = string` lets plain strings stay interchangeable
while giving the zod parser a name to switch on.

## Recipe 3 — auto-detect a new type from the real SQL type (Postgres)

Example: auto-map `inet` → IP-validated string, or `numeric(p,s)` → a branded
decimal. Pattern mirrors how enum/uuid/timestamp already work.

1. **Introspector**: surface whatever the column query doesn't already carry.
   For enums we added `udt_name` to `PgColumnRow` → `ColumnInfo.udtName`. For a
   length/precision-driven rule you'd add `character_maximum_length` /
   `numeric_precision`. SQLite leaves the new field undefined.
2. **`db-codegen.ts`**:
   - For a fixed type name, extend `realKind()` (it already special-cases
     `TIMESTAMP`/`UUID`/`BOOLEAN`).
   - For a value-derived type (enum values, varchar length), resolve it in
     `generateSchemaTypes` (where enums are fetched) and pass it into
     `emitInterface` — then feed the resulting TS type through the existing
     `tsType` plumbing (as enum does via `enumUnion`). Reusing `tsType` means it
     automatically flows through both the public and classified branches.
3. **`zod-codegen.ts`**: if the new type is a recognizable textual shape, detect
   it in `scalarSchema()` (enum uses `stringLiteralUnion()`). Keep the splitters
   quote-aware (`splitUnion`, `splitGenericArgs`) so literal values containing
   `|` or `,` don't break the parse.
4. **Respect precedence**: explicit `tsType` > explicit `kind` > auto-detect.
   The enum resolver only applies `enumUnion` when there's no `tsType`/`kind`.

### High-value candidates not yet implemented

| Source | Maps to | Notes |
|---|---|---|
| `int2`/`int4` SQL type | `z.int()` | stricter than `z.number()`; type stays `number` |
| `int8`/`bigint` | `bigint` + `z.bigint()` | real type change — Recipe 2 + auto-detect |
| `varchar(n)` | `z.string().max(n)` | needs `character_maximum_length` from the introspector |
| `inet`/`cidr` | `z.ipv4()`/`z.ipv6()`/`z.cidrv4()` | PG-native; or expose as a `format` |
| `numeric(p,s)` | branded decimal or `z.string()` | exactness — decide JS representation first |

## Gotchas / invariants

- **`zod-codegen` parses `schema.gen.d.ts` textually**, not via the type checker.
  Anything it must recognize has to be a literal alias name or a parseable
  shape. Keep `INTERFACE_RE`/`FIELD_RE` and the splitters in mind.
- **`db-codegen` owns name mapping** (snake → Pascal interface, snake → camel
  field). `zod-codegen` keys hints by the *already-mapped* names. Never
  re-derive names in `zod-codegen`.
- **Non-`public` Postgres schemas** (`schema.table`) are not fully supported by
  `zod-codegen` (`INTERFACE_RE`'s `\w+` won't match a dotted name). Enum
  matching is by bare `udtName`, which can collide across schemas. Fixing this
  is a separate, worthwhile task.
- **`ColumnKind` is shared** between typing and runtime coercion. A kind that
  needs no coercion (like `uuid`) must be excluded from the coercion map in
  `db-codegen` *and* handled defensively in `fromDb()`.
- **Keep `@pikku/core`'s `data-classification.ts` in lockstep** with the brand
  aliases emitted in the `schema.gen.d.ts` header (`Private`/`Pii`/`Secret` use an
  optional `__classification__?` marker so plain values stay assignable).
