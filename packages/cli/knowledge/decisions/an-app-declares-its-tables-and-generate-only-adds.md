---
type: decision
title: An app declares its tables in db/tables.ts and generate only ever adds
description: db/tables.ts is a plain TablesDeclaration from @pikku/core/db with annotations on the columns, materialised on a throwaway database and diffed against the migrations; only additions are written, everything else is refused, declareOnly tables get types and no SQL, and the -- pikku:tables marker tells a removal from a table never declared
tags: cli, db, migrations, safety
---

# An app declares its tables in db/tables.ts and generate only ever adds

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
project's data, and a missing column may be a slip, so it writes additions only.
Everything else comes back in `GenerateResult.refusals` and writes nothing.
Refusals are returned, not thrown, so migrations already written for other sources
are still reported.

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

**What this rules out:** generate dropping or renaming anything, builder statements
in `db/tables.ts`, and a second way of declaring tables beside `TablesDeclaration`.
