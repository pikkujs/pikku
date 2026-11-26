---
type: decision
title: A default or onUpdate is data, spelled per engine when it is bound
description: default and onUpdate take now, uuid (default only), a literal or sql written once per engine; the engine is read from the database the statement is bound to, a missing key is an error naming the column and engine, and onUpdate is a Postgres function plus trigger, a SQLite trigger or a MySQL column attribute
tags: [schema, declaration, compile-tables, defaults, triggers]
---

# A default or onUpdate is data, spelled per engine when it is bound

`ColumnDefault` and `ColumnOnUpdate` in `@pikku/core/db` are data: a literal, `{ now: true }`,
`{ uuid: true }` (default only) or `{ sql: { postgres?, mysql?, sqlite? } }`. An index `where`
is the same per-engine object. `compileTables` validates the shape without an engine (unknown
keys, a `uuid` on an `onUpdate`, `now` on a column that is not a timestamp) and settles the
engine when a statement is bound, from the database it is bound to: `isPostgres`, then
`ctx.mysql`, otherwise SQLite. A key missing for that engine throws a sentence naming the
column and the engine, so the project's `db.engine` is the only key required and nothing
else has to be told which engine is configured.

`onUpdate` is a different mechanism per engine because the engines differ in what they can say:

- **Postgres** has one shared function, `pikku_on_update`, and a `BEFORE UPDATE` trigger per
  column. The trigger's `when (new.c is not distinct from old.c)` is what makes an explicit
  value win; the function evaluates the expression the trigger hands it (`EXECUTE`) and
  writes it with `jsonb_populate_record`, so one function serves every column and every
  value form.
- **SQLite** has an `AFTER UPDATE` trigger per column, `when new.c is old.c and new.c is not
(expr)`. The second condition stops the trigger's own write from firing it again when the
  new value equals the old one, so it does not depend on `recursive_triggers` being off.
- **MySQL** has `ON UPDATE CURRENT_TIMESTAMP`, a column attribute, which only `now` can use.

A trigger is its own statement, so a statement factory may return `undefined` for an engine it
has nothing to do on, and `compileTables` emits one trigger per column rather than one per
table. The name `<table>_<column>_on_update` is what a later diff looks for: a table's
creation carries its triggers, and a trigger missing from a table that exists is added.
`statementShape` and `splitStatements` in `@pikku/migrator-sql` know the trigger statement
and the SQLite `begin ... end` body, whose semicolons are not statement boundaries.

## Rejected

- **One trigger per table carrying every column.** Adding a second `onUpdate` column would have
  to drop and recreate the trigger, and comparing its text with the database's is fragile. A
  trigger per column is found or missing by name, as an index is.
- **Reading the engine from the declaration or the config at compile time.** The factories
  already learn the dialect from the connection they are bound to, and the framework schemas
  compile with no config at all.
- **Postgres `CURRENT_TIMESTAMP` as `now`.** `now()` is what was asked for; generate treats
  the two as the same default when it compares a column with the migrations, so an existing
  table does not read as changed. The framework golden fixture changed for Postgres only,
  from `CURRENT_TIMESTAMP` to `now()`.
- **A function-valued default or onUpdate.** The declaration is data the console and agents
  read without running anything.
