---
type: decision
title: Declared default and onUpdate SQL is run on the shadow database, and MySQL says it was not
description: materializeDeclaration runs each default sql and onUpdate on a probe table on the PGlite or scratch SQLite shadow database; a failure refuses the declaration, and on MySQL, which has no embedded engine, only the keys are checked and a note says the SQL was not executed
tags: cli, db, migrations, safety
---

# Declared default and onUpdate SQL is run on the shadow database, and MySQL says it was not

Applying the declaration to the shadow database (`materializeDeclaration` in `local-db.ts`) already
catches a syntax error and a missing engine key, because the statements are built and executed
there. It does not catch a default that parses and then fails when a row is inserted (an unknown
function, a value the column type refuses), and it never runs a trigger.

`runDeclaredSql` in `declaration-probe.ts` closes that. For every `default: { sql }` and every
`onUpdate` on a column with a declared type it applies a probe table (`id`, an unrelated `touched`
column, and the column in its declared type with the default or `onUpdate`), inserts a row, and
updates `touched`. The insert proves the default fits; the update proves the trigger runs and ends,
which is where an SQLite trigger that fires itself again would fail. The probes run last, after the
declaration's tables have been read back, because they add tables to the throwaway database.

MySQL has no embedded engine, and the scratch server it does use is for the declaration's own tables.
There only the engine keys and the generated statements are checked, and a note on the plan says the
declared SQL was not executed, so a person reading the output is not told it was verified.

## Rejected

- **Inserting a default row into the real tables.** A table with required columns that have no
  default or a foreign key cannot take one, so the check would fail for reasons unrelated to the
  declared SQL. A probe table has no such columns.
- **Counting how many times a trigger fires.** Neither shadow engine exposes a firing count without a
  counter table, and a trigger that fired twice would have set the same value twice. The probe
  proves it runs and terminates, which is the failure that matters.
- **Executing `{ now }` and `{ uuid }` as well.** They are generated, and the golden SQL tests run
  them on PGlite and SQLite; only author-written SQL needs running per project.
