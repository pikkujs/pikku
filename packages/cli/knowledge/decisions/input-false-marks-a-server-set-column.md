---
type: decision
title: input false marks a server-set column and removes it from every typed input
description: A column declared input false stays in the row type and the row zod schema, is left out of the generated insert and patch zod schemas, and is typed ColumnType<Row, never, never> in the Kysely types
tags: cli, db, zod, types
---

# input false marks a server-set column and removes it from every typed input

`input: false` is an annotation, so it travels in `db/annotations.gen.json` like `security` and
`kind`, and only the value `false` is accepted: there is no `input: true`, because every column is
an input unless it says otherwise.

Two outputs follow from it. `zod.gen.ts` leaves the column out of `<Table>InsertZ` and builds
`<Table>PatchZ` as `<Table>Z.omit({ ... }).partial()`; the row schema `<Table>Z` keeps it, since
the row is what the server returns. `schema.gen.ts` types the column
`ColumnType<Row, never, never>`, Kysely's own spelling of a column that is read but never
written, so `Insertable` and `Updateable` drop it and a statement that names it does not compile.

The repo has no other typed insert or update helper than those two, so they are what "the typed
helpers" means.

## Rejected

- Typing it `Generated<...>` only. That leaves it optional on insert, which is exactly the
  input the declaration says nobody should send.
- A column that is server-set for the client but written by the server's own typed Kysely code.
  That needs a second flag (client input versus server input); until a column needs it, a
  server-side write goes through `sql` and is visible as such.
