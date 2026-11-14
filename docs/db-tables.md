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

- **Postgres** adds it `NOT VALID` and then `VALIDATE`s it in a second
  statement. Be clear about what that buys: the migrator runs a whole migration
  in one transaction, and `ADD CONSTRAINT` takes an `ACCESS EXCLUSIVE` lock that
  lasts until the commit, so writes to the table wait through the validating
  scan anyway. The split only shortens the lock for a runner that applies the
  statements one at a time. Pikku does not run them that way; the guard against
  a long lock is the probe below, which refuses before the migration starts.
  Changing a check drops and re-adds it (atomic, in that transaction); removing
  it from the declaration drops it (only checks named
  `<table>_<column>_<kind>_check`; one you wrote yourself is left alone).
- **MySQL and MariaDB** use `ADD CONSTRAINT ... CHECK`. Dropping is `DROP CHECK`
  on MySQL (8.0.16 or later) and `DROP CONSTRAINT` on MariaDB (10.2 or later).
  An older server parses a `CHECK` and ignores it, so generate refuses. DDL
  commits as it goes there, so a changed check is added under an interim name
  first, the old one dropped, the final name added and the interim one dropped:
  rows that break the new check refuse the first step and leave the old check in
  place. A migration that stops after that step still has to be finished by hand.
  This sequence has been tested only as statements, not against a running
  MySQL or MariaDB server.
- **sqlite** cannot alter a constraint, so the table is rebuilt: a new table with
  the new definition, the rows copied (rowids too, so a TEXT-keyed table, an
  external-content FTS index or a vec0 table still point at their rows, and an
  `AUTOINCREMENT` sequence keeps its highest id), the old one dropped and the
  new one renamed, then its indexes, triggers and views put back. Only the named
  checks are edited in the table's existing definition, so a foreign key,
  `UNIQUE` or check you wrote by hand survives. Rows that break the new check
  make the migration fail and roll back, leaving the original table untouched.
  The migration carries two marker lines, below.

#### Markers a migration carries

- `-- pikku:foreign-keys-off`: the sqlite migrator switches foreign key
  enforcement off around the transaction (so `ON DELETE CASCADE` children are
  not deleted), checks that it really went off, runs the statements one at a
  time, and refuses to commit if a key is left broken that was not before, or
  if an index, trigger or view that existed on the database is gone afterwards
  (one made by hand and missing from the migrations would be). Every sqlite
  runner in this repository uses that migrator.
- `-- pikku:destructive <what it does>`: `migrate` refuses a pending migration
  with this line unless it is told to allow it, before applying anything.
  `pikku db migrate --allowDestructive` and the standalone bundle's
  `db migrate --allow-destructive` do; `db status` on the bundle marks such
  migrations. `pikku db reset` and scratch databases allow it, since there is
  nothing to lose.
- `-- pikku:check-probe {json}`, above each added check: `schema`, `table` and
  the `SELECT` that returns a row only if one breaks the check. `migrate` can be
  given a `beforeMigration` hook, and `checkProbeHook` is the one that runs
  these against the live database, just before that migration (so a table the
  migration before it creates is there to be probed). It refuses on a breaking
  row, on a table estimated above 10 million rows (`CHECK_PROBE_MAX_ROWS`), and
  on a scan that takes over 30 seconds (`CHECK_PROBE_TIMEOUT_MS`). A table never
  analysed (Postgres reports `-1` rows) is counted up to the cap, not trusted.
  A local `pikku db migrate` on postgres or MySQL and the standalone bundle's
  Postgres `db migrate` both use it. On MySQL a scan that times out is
  abandoned rather than cancelled.

A deploy runner outside this repository that applies these migrations has to do
the same two things: refuse a migration with a `-- pikku:destructive` line
unless a person approved it, and run the `-- pikku:check-probe` queries (or
equivalent) before applying a migration that has them. It must also run a
sqlite migration marked `-- pikku:foreign-keys-off` with enforcement off
outside a transaction, as `SqliteMigrationExecutor` does, or refuse it.

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
