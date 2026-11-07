# Declaring tables

An app declares its tables in `db/tables.ts`. `pikku db generate` turns the
declaration into SQL, and `pikku db migrate` applies it and generates the types.
One declaration gives the SQL, the types and the classification, and nothing that
changes a table needs to know where migrations live. `pikku meta db` reports the
file, what it declares, and the commands.

```ts
// db/tables.ts
import { defineTables } from '@pikku/kysely'

export const tables = defineTables({
  statements: [
    (db, _types, ctx) =>
      db.schema
        .createTable('invoice')
        .addColumn('invoiceId', ctx.key, (col) => col.primaryKey())
        .addColumn('customerEmail', ctx.text, (col) => col.notNull())
        .addColumn('paidAt', 'timestamp'),
  ],
  annotations: {
    invoice: {
      customerEmail: { security: 'pii', format: 'email' },
      paidAt: { kind: 'date' },
    },
  },
})
```

Each statement is a function from a Kysely instance to a `db.schema` builder, the
same `PikkuSchema` that `@pikku/kysely` declares its own tables with. It runs
through the camelCase plugin, so names are written as the query builder sees them.
SQLite, Postgres and MySQL all work.

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
| View, enum, trigger                      | Refused: tables and indexes only                      |

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

A foreign key can point at a table the declaration does not own, such as Better
Auth's `user` or a hand-written table. Name it in `requires`, and take the
column's type from `requiredType`, so it matches whatever the migrations gave it:

```ts
import { defineTables, requiredType } from '@pikku/kysely'

export const tables = defineTables({
  requires: [{ table: 'user', column: 'id', owner: 'Better Auth' }],
  statements: [
    (db, types, ctx) =>
      db.schema
        .createTable('note')
        .addColumn('noteId', ctx.key, (col) => col.primaryKey())
        .addColumn('userId', requiredType(types, 'user', 'id'), (col) =>
          col.notNull().references('user.id').onDelete('cascade')
        ),
  ],
})
```

Generate refuses when a required column does not exist yet. A table owned by Better
Auth, the Pikku runtime or an addon cannot be declared here.

## Annotations

`annotations` takes the same fields as `db/annotations.ts`, keyed by table and
column, and merges into `db/annotations.gen.json`. Unlike that file it is strict:
an unknown field, an invalid value, or a column the declaration does not have is an
error. A value the two files disagree on is an error as well. See
[DB column annotations](./db-column-annotations.md).

## What it does not detect

- A changed foreign key, `UNIQUE` or `CHECK` on an existing column.
- A removed index, or a changed definition under the same index name.
- A table adopted from a hand-written migration and later removed from the
  declaration. It goes back to being hand-written, and nothing is dropped.

Each of these writes nothing, so a person writes that migration by hand.

## Moving an existing app over

See [`docs/MIGRATION.md`](./MIGRATION.md#declaring-tables-in-dbtablests).
