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

| Field                                                     | Meaning                                                                                                                                                 |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `type`                                                    | `id`, `key`, `text`, `string(n)`, `integer`, `bigint`, `real`, `boolean`, `timestamp`, `timestamptz`, `uuid`, `json`. Optional on a `declareOnly` table |
| `required`                                                | `NOT NULL`                                                                                                                                              |
| `default`                                                 | A literal, `{ now: true }`, `{ uuid: true }`, or `{ sql: { postgres?, mysql?, sqlite? } }`. See [Defaults and onUpdate](#defaults-and-onupdate)         |
| `onUpdate`                                                | What the column is set to when an `UPDATE` leaves it alone: a literal, `{ now: true }` or `{ sql: { ... } }`                                            |
| `primaryKey`, `unique`, `index`                           | Single-column key, constraint or index. Composite ones go on the table                                                                                  |
| `references`                                              | `table.column`. Without a `type`, the column takes its target's type                                                                                    |
| `onDelete`                                                | `cascade`, `setNull`, `restrict` (the default) or `noAction`                                                                                            |
| `enum`, `min`, `max`, `minLength`, `maxLength`, `pattern` | Value constraints: `CHECK`s in the SQL on Postgres and MySQL (never `pattern`), and bounds in the generated zod schema                                  |
| Annotation fields                                         | `security`, `form`, `keyId`, `classification`, `kind`, `tsType`, `format`, `description`                                                                |

### Column types

`integer` is the default number type: 32-bit storage, read as a `number`.
`bigint` is the 64-bit variant and is still read as a `number`: the generated
coercion map gives the column the `bigint` kind, and a value above
`Number.MAX_SAFE_INTEGER` throws when the row is read instead of rounding. A
decimal reads as a `string` and binary data as a `Uint8Array`; neither can be
declared on a table `pikku db generate` writes, because they only occur in
tables something else creates (see `declareOnly` below).

| The database column                          | Reads as                                           |
| -------------------------------------------- | -------------------------------------------------- |
| `integer`, `smallint`, `serial`, `real`      | `number`                                           |
| `bigint` declared `type: 'bigint'` (or kind) | `number`, throwing above `Number.MAX_SAFE_INTEGER` |
| `bigint`, undeclared                         | `string` on Postgres, `number` on SQLite and MySQL |
| `numeric`, `decimal`                         | `string` on Postgres and MySQL, `number` on SQLite |
| `bytea`, `blob`                              | `Uint8Array`                                       |
| `interval`, `point`                          | `string`                                           |

A table takes `columns`, and optionally `primaryKey` (composite), `unique`
(composite constraints), `indexes` (with `unique`, a partial `where` written per engine, and a `name`),
and `declareOnly`.

### Defaults and onUpdate

A default or `onUpdate` is data, never a function, and the generator spells it
for the project's engine (`db.engine`):

| Declared            | Postgres            | MySQL               | SQLite                                   |
| ------------------- | ------------------- | ------------------- | ---------------------------------------- |
| `default: { now }`  | `now()`             | `CURRENT_TIMESTAMP` | `CURRENT_TIMESTAMP`                      |
| `default: { uuid }` | `gen_random_uuid()` | `(UUID())`          | a version 4 UUID built from `randomblob` |
| `default: 'draft'`  | `'draft'`           | `('draft')` on text | `'draft'`                                |
| `{ sql: { ... } }`  | the `postgres` key  | the `mysql` key     | the `sqlite` key (libSQL and Turso too)  |

```ts
createdAt: { type: 'timestamptz', required: true, default: { now: true } },
updatedAt: {
  type: 'timestamptz',
  required: true,
  default: { now: true },
  onUpdate: { now: true },
},
token: { type: 'uuid', default: { sql: { postgres: 'gen_random_uuid()' } } },
```

`{ sql }` (and an index `where`) hold the SQL for each engine, in physical names. A SQLite or MySQL default is wrapped in parentheses for you, as those engines require for an expression.
Only the key for the configured engine is required; a missing one is an error
naming the column and the engine, and an unknown key is an error. `{ uuid: true }`
is for `uuid`, `id`, `key`, `text` and `string(36)` or longer columns.

`onUpdate` takes the same forms except `uuid`, and a value the statement sets
explicitly always wins:

- **Postgres**: one shared function, `pikku_on_update`, and a `BEFORE UPDATE`
  trigger per column that calls it only when the statement left the column
  unchanged.
- **SQLite**: an `AFTER UPDATE` trigger per column, guarded so its own write does
  not fire it again.
- **MySQL**: the `ON UPDATE CURRENT_TIMESTAMP` column attribute, which only
  `{ now: true }` can use. Any other `onUpdate` needs a trigger written by hand.

Triggers are generated only for the configured engine. They are written with a new
table, or when a column with an `onUpdate` is added to a table that exists; adding
`onUpdate` to an existing column, or changing it, is a migration a person writes.
On a `declareOnly` table nothing is generated, so `pikku db generate` checks that
the migrations create the trigger (or the MySQL attribute) and refuses the
declaration if they do not.

### The declared SQL is run

`pikku db generate` and `pikku db migrate` do not trust a `default: { sql }` or an
`onUpdate` by reading it. Each one is run on the shadow database, which is PGlite
for Postgres and a scratch SQLite database for SQLite, on a probe table with the
column in its declared type: the statement has to parse, the default has to fit the
type when a row is inserted, and the `onUpdate` has to survive an `UPDATE` that does
not name its column. A failure refuses the declaration with the column and the
database's own message, and nothing is written. MySQL has no embedded engine, so only
the engine keys and the generated statements are checked, and the output says the
SQL was not executed.

### Server-set columns

`input: false` marks a column the server sets, such as an `onUpdate` timestamp.
The generated zod schemas leave it out of `<Table>InsertZ` and `<Table>PatchZ`
(it stays in `<Table>Z`, the row), and the generated Kysely type is
`ColumnType<Row, never, never>`, so an insert or update that names it does not
compile. Only `false` is accepted.

### Constraints

`enum`, `min`, `max`, `minLength` and `maxLength` always drive the generated zod
schema, the generated union types (`enum`) and the console's column hints.
`pattern` is checked by the generated zod schema only, never in SQL, because
regex dialects differ.

Whether the database enforces them depends on the engine:

- **Postgres and MySQL**: real inline `CHECK` constraints, named
  `<table>_<column>_<hash>_<kind>_check` (`kind` is `enum`, `min`, `max`,
  `minlength` or `maxlength`), written on `CREATE TABLE` and on a column added
  later. `<hash>` is eight hex digits of a hash of the table and column taken as
  a pair: MySQL keeps check names schema-wide, and joining names with `_` is
  ambiguous (`sales_line.qty` and `sales.line_qty` would both read
  `sales_line_qty`), so the pair, not the joined text, decides. A name that
  would pass the engine's limit (63 bytes on Postgres, 64 characters on MySQL)
  has its readable front cut, never the hash or the ending, so two bounds on one
  column stay distinct. This scheme has not shipped, so there are no deployed
  names of another form to carry. A check is recognised as generated by the
  shape of its name alone (see below), so a check you named yourself is left
  alone unless you give it a name of that shape.
- **SQLite**: validation only. SQLite cannot drop or change a `CHECK` without
  rebuilding the table, so Pikku generates none, for new tables, new columns or
  existing ones. `pikku db generate` and `pikku db check` print one notice
  listing each declared constraint with the `CHECK` you could add in a
  hand-written migration, or you can use Postgres or MySQL, where Pikku manages
  them. A `CHECK` you wrote by hand in a SQLite migration is left alone, an
  `IN (...)` one still types the column as a union, and a constraint the
  migrations already enforce (a hand-written check whose condition says the same
  thing, under any name) is left out of the notice: write the suggested `CHECK`
  in a migration and the notice goes. One that differs from the declaration is
  still listed. Silence the notice with
  `validate.rules["db-sqlite-unenforced-constraints"] = "off"` in the Pikku
  config.

#### Where a constraint is actually enforced

A declared constraint is enforced at runtime only where a function uses the
generated zod schema (`<Table>InsertZ`, `<Table>PatchZ` or `<Table>Z`, from
`.pikku/db/zod.gen.ts`) as its `input`. A Kysely write that skips such a
function (a direct `db.insertInto(...)`, a script, a migration, another
service) is guarded only by the database's `CHECK`s: on Postgres and MySQL
those, and on SQLite nothing at all. If a value must never be wrong, put it
behind a function whose `input` is the generated schema, and on SQLite add the
`CHECK` yourself.

Two details of the generated zod schema and types:

- A whole-number column (`integer`, `bigint`, `smallint`, `serial` and the other
  `INT` types) is emitted as `z.number().int()`, so `1.5` is rejected before it
  reaches the database. A float, `numeric` or `decimal` column stays
  `z.number()`, and so does a column with a `tsType` override.
- The declaration is the source of truth for an `enum`. When the declared values
  and the values the database holds differ (a Postgres enum or a `CHECK ... IN`
  on a column whose declaration changed), the generated union follows the
  declaration and `pikku db generate`/`migrate`/`codegen` warn once per column
  (`PKU488`): `Column "table.column": declared 'a' | 'b' but the database has
'x' | 'y'`. On Postgres and MySQL, run `pikku db generate` for the migration
  that brings the database in line; on SQLite, which gets no generated CHECK,
  the warning says to add the `CHECK` by hand, change the declaration to match,
  or drop the stale CHECK by hand. The same values in a different order are not a mismatch.

On a Postgres or MySQL column that already exists:

- **Postgres** adds it `NOT VALID` and then `VALIDATE`s it in a second
  statement. Be clear about what that buys: the migrator runs a whole migration
  in one transaction, and `ADD CONSTRAINT` takes an `ACCESS EXCLUSIVE` lock that
  lasts until the commit, so writes to the table wait through the validating
  scan anyway. The split only shortens the lock for a runner that applies the
  statements one at a time. Pikku does not run them that way; the guard against
  a long lock is the probe below, which refuses before the migration starts.
  Changing a check drops and re-adds it (atomic, in that transaction); removing
  it from the declaration drops it. A check is recognised as one Pikku
  generated by the shape of its name, `<...>_<8 hex>_<kind>_check`, and a
  generated-shape check the declaration no longer wants is dropped even when
  the table or column was renamed by hand (the hash no longer matches the new
  names); `db check` reports it as stale. A check you named yourself, not in
  that shape, is left alone, and a bound the declaration keeps is never dropped
  because an equal check under another name is going.
- **MySQL** uses `ADD CONSTRAINT ... CHECK` and `DROP CHECK`, from 8.0.16.
  An older server parses a `CHECK` and ignores it, so generate refuses as soon
  as the declaration has a constraint. DDL
  commits as it goes there, so a changed check is added under an interim name
  first (`pikku_next_` followed by the check's own name,
  `<table>_<column>_<hash>_<kind>_check`, with the front cut by code point
  until the whole name fits 63 bytes), the old one dropped, the final name
  added and the interim one dropped. A stale check under another name needs no
  interim: the new name is added first and then the stale one dropped, and a
  bound that was only removed is just dropped. Rows that break the new check refuse the first step and leave the old check in
  place. A migration that stops after that step still has to be finished by hand.
  MariaDB is refused up front, before anything runs against it ("MariaDB is
  not supported; use MySQL 8.0.16+ or Postgres"). Aurora MySQL 3.x
  (8.0-compatible) is accepted; Aurora 2.x and MySQL 5.7 are refused. A check MySQL
  holds `NOT ENFORCED` is read as not enforcing: it is dropped and added again
  rather than counted as the bound, and no enum is read from it. The checks are
  read back from `information_schema` as a real MySQL 8.4 stores them
  (charset introducers, escaped quotes and backslashes), and that read-back is
  tested against output captured from one.

A check's name hashes the table and column pair, so `sales_line.qty` and
`sales.line_qty` cannot collide (MySQL keeps check names schema-wide). A name
longer than the engine allows (63 bytes on Postgres, 64 characters on MySQL)
loses characters from the table-and-column part, by code point, never from the
hash or the kind.

#### Markers a migration carries

- `-- pikku:destructive [what it does]`: `migrate` refuses a pending migration
  with this line unless it is told to allow it, before applying anything.
  `pikku db migrate --allowDestructive` and the standalone bundle's
  `db migrate --allow-destructive` do; `db status` on the bundle marks such
  migrations. `pikku db reset` and scratch databases allow it, since there is
  nothing to lose. `pikku ci` passes it only when its worktree's database is its own
  (a SQLite file or embedded Postgres inside the worktree), or when you pass
  `pikku ci --allowDestructive`; a worktree whose committed config points at a
  local server does not get it, and never your own tree. The line may be bare, indented, in any case, or written
  `--pikku:destructive`. `db generate` writes it above every `DROP COLUMN` and
  `DROP TABLE` it produces, and you can write it by hand on any migration you
  want the same stop for.
- `-- pikku:check-probe {json}`, above each added check: `schema`, `table` and
  the `SELECT` that returns a row only if one breaks the check. `migrate` can be
  given a `beforeMigration` hook, and `checkProbeHook` is the one that runs
  these against the live database, just before that migration (so a table the
  migration before it creates is there to be probed; a probe that follows an
  data-changing statement in the same file is not run, since that statement
  changes the rows it would read). Detected, and only these:
  - a statement that starts (after comments, whitespace and opening
    parentheses) with `UPDATE`, `DELETE`, `INSERT`, `TRUNCATE`, `MERGE`,
    `REPLACE`, `CALL` or `LOAD`, and those words after a `WITH` ... CTE or
    after another statement on the same line;
  - `COPY ... FROM` (not `COPY ... TO`);
  - a `DO` block, dollar-quoted (`$$`, `$tag$`, tags may hold digits but not
    start with one: `$f1$`) or a quoted string (`DO '...'`, `''` for a quote),
    with an `UPDATE`, `DELETE`, `INSERT`, `TRUNCATE`, `MERGE`, `REPLACE`,
    `CALL`, `COPY` or `EXECUTE` in its body outside string literals and
    comments;
  - `EXPLAIN` of a statement that changes data (`EXPLAIN ANALYZE UPDATE` runs
    it).

  Words in strings, comments and quoted names are ignored. The `DO` and
  `EXPLAIN` rules over-read on purpose: a `FOR UPDATE` inside a `DO` body, or a
  plain `EXPLAIN UPDATE`, also stops the probes, which costs a probe that does
  not run, never a probe that ran on rows a statement had changed. Blind
  spots, which no scan of the text can close: `PREPARE ... EXECUTE` (the
  statement is built at run time), `ALTER TABLE ... ALTER COLUMN ... TYPE ...
USING ...` (it rewrites the rows), and a `SELECT` that calls a function with
  side effects. A refusal says which
  migrations of the run had already applied. It refuses on a breaking
  row, on a table estimated above 10 million rows (`CHECK_PROBE_MAX_ROWS`), and
  on a scan that takes over 30 seconds (`CHECK_PROBE_TIMEOUT_MS`), which the
  server itself cancels (`statement_timeout` on Postgres, `max_execution_time`
  on MySQL; the MySQL probe puts the session's previous limit back afterwards). A table never
  analysed (Postgres reports `-1` rows) is counted up to the cap, not trusted.
  A local `pikku db migrate` on postgres or MySQL and the standalone bundle's
  Postgres `db migrate` both use it.

A deploy runner outside this repository that applies these migrations has to do
the same two things: refuse a migration with a `-- pikku:destructive` line
unless a person approved it, and run the `-- pikku:check-probe` queries (or
equivalent) before applying a migration that has them.

A bound on a column of the wrong kind (`min` on text,
`minLength` on a number) is an error when the file loads, as is a column with
both an `enum` and a `pattern` (a pattern adds nothing to a fixed list), and a
`default` outside the column's own `min`/`max`/`minLength`/`maxLength`.

A field that is not one of these is an error, as is an invalid annotation value:
`security: 'pi'` is refused rather than left at the default.

## What `pikku db generate` does

It applies the declaration to a throwaway database, compares the result with what
the existing migrations build, and writes what is missing, one file per kind of
change, in the order they can apply: renames, then additions, then drops.

| Change                                   | Result                                                       |
| ---------------------------------------- | ------------------------------------------------------------ |
| New table                                | `CREATE TABLE`, with its indexes                             |
| New nullable column                      | `ALTER TABLE ... ADD COLUMN`, keeping its constraints        |
| New column with default                  | `ALTER TABLE ... ADD COLUMN`, keeping its constraints        |
| New index                                | `CREATE INDEX`                                               |
| Table already migrated                   | Adopted, not created again                                   |
| Column with `renamedFrom`                | `ALTER TABLE ... RENAME COLUMN`, rows kept (see below)       |
| Column removed                           | `DROP COLUMN`, marked `-- pikku:destructive`, needs approval |
| Table removed (one `generate` declared)  | `DROP TABLE`, marked `-- pikku:destructive`, needs approval  |
| Type, `NOT NULL`, default or key changed | Refused: a person writes that migration                      |
| New `NOT NULL` column without a default  | Refused                                                      |
| New primary key column                   | Refused                                                      |
| A table renamed                          | Not supported: it is a drop and a create, and needs approval |

A refusal writes nothing and the command exits non-zero with the reason. The
migrations of other sources (Better Auth, the Pikku runtime, addons) are still
written.

### Drops need approval

A drop loses data, so `generate` lists each one and writes nothing for it until a
person approves. On a terminal it asks (`Write these migrations? [y/N]`); anywhere
else it refuses and says to run `pikku db generate --allowDestructive`. Each drop
is written in its own file, behind a `-- pikku:destructive` line, so
`pikku db migrate` stops on it again until it is given `--allowDestructive`: the
data is only lost when both are said.

- Only a table a previous `generate` recorded (`-- pikku:tables`) is ever
  dropped. A hand-written table that the declaration never named is left alone.
- Drops are never `CASCADE`. A column or table the engine will not drop (a column
  a `UNIQUE` key holds on sqlite, a table another table has a foreign key to) is
  refused with the engine's own reason, because the rehearsal applies the drop
  first. Pikku does not read foreign keys to order drops: drop the dependent
  table in one run and the table it pointed at in the next, or write that
  migration by hand.
- On sqlite the indexes of a dropped column are dropped first.
- A column that has moved is not a drop: see `renamedFrom` below.

### Renaming a column

Declare the column under its new name with `renamedFrom` set to the old one, and
`generate` writes `RENAME COLUMN`, so the rows stay:

```ts
caption: { type: 'text', renamedFrom: 'label' },
```

Delete `renamedFrom` once the migration is applied; until then `generate` says
`already renamed from 'label': delete renamedFrom`, and writes nothing more.
It is refused where the old name could still be in play: on a column that is
part of a key, an index or a reference, when another column still has the old
name, and on a `declareOnly` table. If the migrations hold both names, `generate`
cannot tell which to keep and refuses. A name that matches no column is treated
as a new column, and the note says so. A renamed column's generated checks
(Postgres and MySQL) are dropped before the rename and re-added under the new
column's name in the next file, because MySQL refuses to rename a column a
`CHECK` still names.

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

Generate refuses when the target does not exist yet. A table owned by Better Auth or
the Pikku runtime cannot be generated from here, but it can be declared with
`declareOnly`. A table an addon declares cannot: declaring it here too is refused as
declared by two owners (reference its columns instead).

## Addons

An addon declares its own tables the same way, in its `db/tables.ts`, and `pikku db
export` (run by `pikku all`) publishes the declaration as plain JSON. `pikku db
generate` reads the declaration of each wired addon, adds it to the app's, and plans
the result once, so an addon's tables get everything the app's do: derived SQL,
column annotations and constraints in the sidecar and the generated Zod, and
approval for drops and renames. `pikku db migrate`, `check`, `codegen` and `reset`
read the same list.

```ts
// the addon's db/tables.ts, wired as `wireAddon({ name: 'labels', ... })`
export const tables = defineTables({
  labelsLabel: {
    columns: {
      id: { type: 'key', primaryKey: true },
      name: { type: 'text', required: true, unique: true },
    },
  },
})
```

- Every table starts with the wired name, snake-cased (`labels_label`). A table
  without it is an error, so two addons cannot collide.
- A table name has one owner: the app and each addon. Declaring it twice is an error.
- `declareOnly` is refused in an addon. An addon may reference a table the app
  owns, such as `user.id`.
- A `wireRemoteAddon` addon contributes nothing: its tables belong to the host.
- An addon built before it declared tables (artifact holds SQL per dialect) is
  refused with "rebuild or upgrade the addon"; there is no fallback.
- Tables an addon's older migration already created are adopted, not created again.

`pikku all` writes `db/schema.gen.ts` before any command has inspected the project
(`ensureDbTypes`), so it knows no addons: until the next `pikku db migrate`, the
sidecar and generated types are the app's alone.

An addon's names are plain identifiers (letters, digits and underscores, at most 63
characters), as are the app's. A column an addon declares is never `security:
'public'`: the app can expose it in its own declaration. The published file is
capped at 1 MB and 1000 tables.

Adopting is not owning. A table an old addon migration created is adopted by name
with nothing to write, so when nothing else is written in that run no migration
records it as declared. If the addon later removes it, the table is kept and `--allowDestructive` offers nothing; drop it by
hand. A drop is offered only for tables a generated migration recorded. Unwiring an
addon (or wiring it as remote) is an approved drop of what it recorded, with or
without a `db/tables.ts`.

`pikku meta context/db` is addon-blind, like `ensureDbTypes`: it reads the app's own
declaration until the next `pikku db migrate`.

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
not have, or a `type`, `tsType` or `kind` the real column cannot hold, is
refused. Columns the declaration leaves out are not checked.

A column's `type` is optional here: it is read from the column the migrations
create. A `bigint` column left undeclared reads as a `string` on Postgres; declare
`type: 'bigint'` (or `kind: 'bigint'`) to read it as a number with the range
check. A `tsType` of `number` over a column that reads as a string is an error
that names the fix. `pikku meta db` lists these tables
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
Changing a column's type, or making an existing column `NOT NULL`, is refused
with that advice rather than guessed at.

## Moving an existing app over

See [`docs/MIGRATION.md`](./MIGRATION.md#declaring-tables-in-dbtablests).
