---
type: decision
title: A declaration emits tables, then indexes, then extra statements
description: compileTables has one statement order for every schema; porting the framework schemas rearranged three of them (agent, virtualUser, credential) and nothing else
tags: [schema, declaration, compile-tables, golden]
---

# A declaration emits tables, then indexes, then extra statements

`compileTables` in `src/schema/compile-tables.ts` emits every `create table` in
declaration order, then every index (column `index: true` first, then `indexes[]`,
table by table). `statementsOf` in `src/schema/index.ts` appends a schema's
`extraStatements` after that.

When the 17 framework schemas were ported from builder statements to declarations,
three had interleaved an index after its table (`agent`, `virtualUser`) or put the
credentials expression index straight after `credentials` (`credential`). The others
already put all tables first. No single rule reproduced both, so the order was made
explicit instead of adding an ordering knob to the declaration.

**Why this is safe:** an index only depends on its own table, and every table still
comes before any index. The migration writer slices SQL per table
(`tableCreationSql` in `@pikku/migrator-sql`), so a table's own statements are the same
either way; only the full body of a first migration reads in a different order.

**The gate:** `src/schema/framework-schemas.golden.json` holds the SQL the builder
statements compiled to, per schema, for sqlite, postgres and MySQL, unqualified, under
`withSchema('app')` and under `withUserTable('users')`. `framework-schemas.golden.test.ts`
requires the declarations to compile to exactly that, rearranged as tables then the rest.
Every statement is byte-identical. Do not regenerate the fixture from the declarations:
it changes only with a deliberate schema change.
