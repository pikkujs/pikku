---
type: decision
title: An app declares its tables in db/tables.ts and generate adds, renames on request, and drops only with approval
description: db/tables.ts is a plain TablesDeclaration from @pikku/core/db with annotations on the columns, materialised on a throwaway database and diffed against the migrations; additions are written, renamedFrom renames a column and keeps its rows, drops are written marked pikku:destructive only once approved, a changed type or constraint is refused, declareOnly tables get types and no SQL, and the -- pikku:tables marker tells a removal from a table never declared
tags: cli, db, migrations, safety
---

# An app declares its tables in db/tables.ts and generate adds, renames on request, and drops only with approval

`db/tables.ts` exports `tables`, a `TablesDeclaration` written with `defineTables`
from `@pikku/core/db`. Its presence is the opt-in. It is the same plain declaration
the framework's own `PikkuSchema`s hold, so there is one vocabulary for tables, and
it is data: the console and agents can read it without running Kysely. The
annotations sit on the columns, so a table's shape and its classification are
written in one place. `loadTableDeclaration` in
`packages/cli/src/functions/db/table-declaration.ts` reads the file, checks every
field (an unknown one is an error, not ignored), derives the annotation map in
physical names, and runs `compileTables` over the whole declaration so a mistake is
a sentence naming the column before anything touches a database.

The earlier shape, `defineTables({ statements, requires, annotations })` from
`@pikku/kysely`, is refused in one sentence pointing at `docs/MIGRATION.md`. There
is no fallback: builder statements could create anything, which is what made
"only tables and indexes" a check after the fact instead of a property of the
format. `requires` went with it; a `references` without a `type` is the
requirement, and its type comes from the migrations.

`planDeclaredTables` in `packages/cli/src/functions/db/local-db.ts` applies the
declaration to a throwaway database, reads the result back, and diffs that against
what the migrations build. Other schema sources are a package's published schema,
so a column they stopped writing is dropped on their behalf. This one is the
project's data, and a missing column may be a slip, so a drop is never written
unprompted: see "Drops and renames" below. What generate will not change (a type, a
constraint, a new primary key, a new NOT NULL column without a default) comes back in
`GenerateResult.refusals` and writes nothing. Refusals are returned, not thrown, so
migrations already written for other sources are still reported.

A passing migration is rehearsed on a copy of the migrations and diffed again, which
catches what no comparison can see, such as sqlite rejecting a `UNIQUE` column on
`ADD COLUMN`.

Generated migrations carry a `-- pikku:tables` marker listing what was declared. Without
it a table that left the declaration cannot be told from a hand-written table that was
never in it. The migrations are labelled `app-tables` and stay app-owned in provenance.

## declareOnly

A table marked `declareOnly: true` is created by something else (Better Auth, a
hand-written migration) and declared for its types and annotations. It is left out
of the generated SQL and the marker, and `refuseTableChanges` never sees it, since
generate never changes it. Nothing else would notice it drifting, so its declared
columns are checked against the table the migrations build: a column the table
lacks, or a `type` or `kind` the real column cannot hold, is refused
(`declareOnlyProblems`). The type check compares families, not exact types, because
engines store some types as others (sqlite dates as text, MySQL uuids as
`char(36)`, booleans as integers). A table that moves from generated to
`declareOnly` is not treated as dropped.

## Annotations live only on the columns

`db/tables.ts` is the one place column annotations are declared; the old
`db/annotations.ts` is gone. A project that still has it is refused with one
sentence pointing at `docs/MIGRATION.md` (`retiredAnnotationsMessage` in
`table-declaration.ts`, and `retired-annotations-file` in `pikku validate`),
because nothing reads it and its classifications would otherwise stop applying
silently. A table only the migrations create carries its annotations through
`declareOnly`.

**What this rules out:** generate dropping anything unapproved, builder statements
in `db/tables.ts`, and a second way of declaring tables beside `TablesDeclaration`.

## Drops and renames

`refuseTableChanges` returns the changes that need a person next to the refusals: a
column gone from the declaration is a `DestructiveChange`, as is a recorded table that
left it (`-- pikku:tables` is what makes it a drop and not a hand-written table).
`planDeclaredTables` rehearses the whole migration first, so what is offered for
approval is what would be written, then returns it without bodies unless
`allowDestructive`. `db generate` asks on a TTY (`confirmDestructive`, using
`askYesNo` from `addon-grants.ts`); with no terminal it refuses and names
`--allowDestructive`. Each drop starts with `-- pikku:destructive <what>`, written by
`generate` (not only by hand), so `migrate` stops on it independently of the generate
approval. Drops are never `CASCADE`, and there is no foreign-key introspection: a
drop the engine refuses (sqlite on a column a `UNIQUE` key holds; a table another
table references) fails the rehearsal and is returned as a refusal with the engine's
words. Table rename is not supported: it is a drop and a create.

`renamedFrom` on a column (physical old name, `tableRenames` validates it) is applied to
the covered schema before anything is compared (`applyRenames`), so a rename is not
seen as a drop plus an add, and it is not destructive: it keeps the rows and needs no
approval. A rename refused on a column in a key, index or reference, because those
keep the old name in their own. Once applied, the new name is in the migrations and
the old is not, and `generate` says to delete `renamedFrom`.

One file per kind of change, in this order: renames, additions, drops. A renamed
column's generated checks are dropped in the rename file before the `RENAME COLUMN`
and the new checks are added in the additions file, because MySQL 8.4 refuses
`RENAME COLUMN` while a `CHECK` uses the column (error 3959, proven on a real server
by `verifiers/db-schema`), and the migrator's probes run before the file they sit in.

## Constraints on existing columns

Adding, changing or removing a declared `CHECK` on a Postgres or MySQL column that exists is written, not refused. Postgres adds `NOT VALID` then `VALIDATE`s, but the migrator's one transaction holds the `ACCESS EXCLUSIVE` lock to the commit, so the split does not shorten the lock; the probe is the guard. MySQL needs 8.0.16 (older servers parse and ignore `CHECK`, so generate refuses up front, from the declaration); MySQL drops with `DROP CHECK`, and a changed check is added under an interim name before the old one is dropped, since DDL commits as it goes. Each added check carries a `-- pikku:check-probe {json}` line, which `checkProbeHook` (a `beforeMigration` hook of `migrate`, wired into local `db migrate` and the standalone Postgres `db migrate`) runs against the live rows before that migration. Check names stay within 63 bytes by swapping the middle for a hash while keeping the `_<kind>_check` ending.

**SQLite gets no generated CHECK, by decision.** It cannot drop or change one without rebuilding the table, and a rebuild (copy, drop, rename, put indexes/triggers/views back, foreign keys off) is a destructive migration Pikku will not write on the user's behalf. The declared constraints still drive zod, the generated unions and the console; the database just does not enforce them, and generate/check say so once with the `CHECK` SQL to add by hand. Hand-written sqlite checks are left alone and still read back as enums. `pikku:destructive` stays as a gate any migration can carry; bun:sqlite drops the error of a statement that something follows, so its `exec` runs one statement at a time using a sqlite-specific splitter (no backslash escapes, no dollar quoting), otherwise a failed hand-written copy would go on to drop its source table and be recorded as applied.

## Addons declare theirs the same way

An addon puts its tables in its own `db/tables.ts`; `pikku db export` validates
the declaration (`parseDeclaration`, shared with `loadTableDeclaration`) and writes
it as JSON to `.pikku/db/pikku-db-meta.gen.json`, replacing the per-dialect SQL it
used to carry. `addonDeclarations` in `packages/cli/src/functions/db/addon-declarations.ts`
reads each wired local addon's file, and `mergeDeclarations` adds them to the app's
declaration (a table name declared twice is an error; `compileTables` runs again over
the merged whole). `planDeclaredTables` then runs once on the result, so addon tables
need no second diff path, and every command that plans (generate, migrate, check,
codegen, reset) gets the addon list from the inspector through `wiredAddons`.
Without it the `-- pikku:tables` marker would read an addon's recorded tables as
removed. `ensureDbTypes` has no inspector state and writes the sidecar app-only.
An addon table without the wired name's prefix, `declareOnly` in an addon and the old
SQL-per-dialect artifact are all errors.
