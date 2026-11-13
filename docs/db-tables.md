# Declaring tables

An app declares its tables in `db/tables.ts`. `pikku db generate` turns the
declaration into SQL, and `pikku db migrate` applies it and generates the types.
One declaration gives the SQL, the types and the classification, and nothing that
changes a table needs to know where migrations live. `pikku meta db` reports the
file, what it declares, and the commands.

```ts
// db/tables.ts
import { defineTables } from '@pikku/core/db'

export const tables = defineTables({
  invoice: {
    columns: {
      invoiceId: { type: 'key', primaryKey: true },
      customerEmail: {
        type: 'text',
        required: true,
        security: 'pii',
        format: 'email',
      },
      paidAt: { type: 'timestamp', kind: 'date' },
    },
    indexes: [{ columns: ['customerEmail'] }],
  },
})
```

The declaration is plain data: no Kysely, no functions. Tables and columns are
named the way queries name them (camelCase); the SQL gets snake_case. SQLite,
Postgres and MySQL all work from the same declaration.

## Columns

| Field                                                     | Meaning                                                                                                              |
| --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `type`                                                    | `id`, `key`, `text`, `string(n)`, `integer`, `bigint`, `real`, `boolean`, `timestamp`, `timestamptz`, `uuid`, `json` |
| `required`                                                | `NOT NULL`                                                                                                           |
| `default`                                                 | A literal, `{ now: true }`, or `{ sql: '...' }` passed through verbatim                                              |
| `primaryKey`, `unique`, `index`                           | Single-column key, constraint or index. Composite ones go on the table                                               |
| `references`                                              | `table.column`. Without a `type`, the column takes its target's type                                                 |
| `onDelete`                                                | `cascade`, `setNull`, `restrict` (the default) or `noAction`                                                         |
| `enum`, `min`, `max`, `minLength`, `maxLength`, `pattern` | Value constraints: `CHECK`s in the SQL (not `pattern`), and bounds in the generated zod schema                       |
| Annotation fields                                         | `security`, `form`, `keyId`, `classification`, `kind`, `tsType`, `format`, `description`                             |

A table takes `columns`, and optionally `primaryKey` (composite), `unique`
(composite constraints), `indexes` (with `unique`, a partial `where`, and a `name`),
and `declareOnly`.

### Constraints

`enum`, `min`, `max`, `minLength` and `maxLength` become inline `CHECK`
constraints named `<table>_<column>_<kind>_check` (`kind` is `enum`, `min`,
`max`, `minlength` or `maxlength`); `enum` also types the column as a union.
`pattern` is checked by the generated zod schema only, never in SQL, because
regex dialects differ. A `CHECK` is written on `CREATE TABLE` and on a column added later, which is what
lets sqlite add one with `ADD COLUMN`. On a column that already exists:

- **Postgres** adds it `NOT VALID` and then `VALIDATE`s it in a second statement,
  so writes continue during the scan. Changing one drops and re-adds it;
  removing it from the declaration drops it (only checks named
  `<table>_<column>_<kind>_check`; one you wrote yourself is left alone).
- **MySQL** uses `ADD CONSTRAINT ... CHECK` and `DROP CHECK`, which need 8.0.16
  or later. An older server parses a `CHECK` and ignores it, so generate refuses.
- **sqlite** cannot alter a constraint, so the table is rebuilt: a new table with
  the new definition, the rows copied, the old one dropped and the new one
  renamed, then its indexes, triggers and views put back. The migration is
  marked `-- pikku:destructive`, and `-- pikku:foreign-keys-off` makes the
  migrator switch foreign key enforcement off around the transaction (so
  `ON DELETE CASCADE` children are not deleted) and refuse to commit if a key is
  left broken. Only the named checks are edited in the table's existing
  definition, so a foreign key, `UNIQUE` or check you wrote by hand survives.
  Rows that break the new check make the migration fail and roll back, leaving
  the original table untouched.

Each added check is preceded by a `-- pikku:check-probe SELECT 1 FROM t WHERE NOT
(...) LIMIT 1` comment. A deploy runs that probe first: any row back means the
existing data breaks the new check. `runCheckProbe` in `check-migration.ts`
runs it with a 30 second timeout (`CHECK_PROBE_TIMEOUT_MS`) and declines tables
estimated above 10 million rows (`CHECK_PROBE_MAX_ROWS`), where the migration
should be written by hand.

A bound on a column of the wrong kind (`min` on text,
`minLength` on a number) is an error when the file loads.

A field that is not one of these is an error, as is an invalid annotation value:
`security: 'pi'` is refused rather than left at the default.

## What `pikku db generate` does

It applies the declaration to a throwaway database, compares the result with what
the existing migrations build, and writes the next migration with what is missing:

| Change                                   | Result                                                |
| ---------------------------------------- | ----------------------------------------------------- |
| New table                                | `CREATE TABLE`, with its indexes                      |
| New nullable column                      | `ALTER TABLE ... ADD COLUMN`, keeping its constraints |
| New column with default                  | `ALTER TABLE ... ADD COLUMN`, keeping its constraints |
| New index                                | `CREATE INDEX`                                        |
| Table already migrated                   | Adopted, not created again                            |
| Column or table removed                  | Refused                                               |
| Rename                                   | Refused, and named as a possible rename               |
| Type, `NOT NULL`, default or key changed | Refused                                               |
| New `NOT NULL` column without a default  | Refused                                               |
| New primary key column                   | Refused                                               |

A refusal writes nothing and the command exits non-zero with the reason. Taking
data away is a person's decision: they write that migration by hand, and generate
then agrees with it. The migrations of other sources (Better Auth, the Pikku
runtime, addons) are still written.

Before writing, the migration is rehearsed on a copy of the existing ones and
compared again. That catches what the engine itself rejects, such as a `UNIQUE`
column added to an existing sqlite table.

`pikku db check` and `pikku db migrate` stop when the declaration is ahead of the
migrations.

## Tables outside the declaration

A foreign key can point at a table the declaration does not create, such as Better
Auth's `user` or a hand-written table. Leave out the column's `type` and it takes
the type the migrations gave the target, `uuid` on a Postgres `user.id` included:

```ts
export const tables = defineTables({
  note: {
    columns: {
      noteId: { type: 'key', primaryKey: true },
      userId: { references: 'user.id', onDelete: 'cascade', required: true },
    },
  },
})
```

Generate refuses when the target does not exist yet. A table owned by Better Auth,
the Pikku runtime or an addon cannot be generated from here, but it can be declared
with `declareOnly`.

## `declareOnly` tables

A table something else creates can still be declared, for its types and
annotations, with `declareOnly: true`:

```ts
export const tables = defineTables({
  user: {
    declareOnly: true,
    columns: {
      id: { type: 'id', primaryKey: true },
      email: { type: 'text', security: 'pii', format: 'email' },
    },
  },
})
```

No SQL is generated for it and generate never changes it. Its columns are checked
against the table the migrations create instead: a declared column the table does
not have, or a `type` or `kind` the real column cannot hold, is refused. Columns
the declaration leaves out are not checked. `pikku meta db` lists these tables
apart from the generated ones.

## Annotations

The annotation fields on a column (`security`, `form`, `keyId`,
`classification`, `kind`, `tsType`, `format`, `description`) are the only place
annotations come from. `pikku db migrate` writes them to `db/annotations.gen.json`,
which the generated types, the anonymizer and the console read. A project that
still has the old `db/annotations.ts` is refused until its entries move onto the
columns. See [DB column annotations](./db-column-annotations.md) and
[MIGRATION.md](./MIGRATION.md#dbannotationsts-is-removed).

## What it does not detect

- A changed foreign key or `UNIQUE` on an existing column.
- A removed index, or a changed definition under the same index name.
- A table adopted from a hand-written migration and later removed from the
  declaration. It goes back to being hand-written, and nothing is dropped.

Each of these writes nothing, so a person writes that migration by hand.

## Moving an existing app over

See [`docs/MIGRATION.md`](./MIGRATION.md#declaring-tables-in-dbtablests).
