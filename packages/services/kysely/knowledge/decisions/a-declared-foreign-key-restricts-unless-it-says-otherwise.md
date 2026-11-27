---
type: decision
title: A declared foreign key restricts unless it says otherwise
description: compileTables and SchemaContext.references default onDelete to restrict; the framework schemas say cascade explicitly, and dialect mapping stays in the compiler, not the declaration
tags: [schema, declaration, foreign-keys, compile-tables]
---

# A declared foreign key restricts unless it says otherwise

`SchemaContext.references` and `foreignKeys` in `src/schema/pikku-schema.types.ts` take an
`onDelete` of `cascade | setNull | restrict | noAction`, and `onDeleteAction` turns an
absent one into `restrict`. `compileTables` in `src/schema/compile-tables.ts` passes a
column's `onDelete` straight through, so a `references` without one compiles to
`on delete restrict`.

Before this, every foreign key was `on delete cascade`, hardcoded. The framework's own
schemas (`*.schema.ts`) now pass `'cascade'` explicitly, and their compiled SQL is byte
for byte what it was on all three dialects (`compile-tables.test.ts`, "the framework
schemas keep cascading on every dialect").

**Why restrict:** a delete that silently takes other rows with it is the unsafe default;
a refused delete is a sentence the developer can act on.

**Dialect mapping lives in the compiler.** The declaration (`@pikku/core/db`) names
engine-neutral types. `compileTables` decides: `uuid` is `uuid` on postgres, `char(36)`
on MySQL, `text` on sqlite; `json` is `jsonb` / `json` / `text`; `timestamptz` is
postgres-only and plain `timestamp` elsewhere; a `text` column that takes part in any key
gets `ctx.key` so MySQL gets a bounded type. A partial index (`where`) is refused on
MySQL, which has none.

**What this rules out:** inferring `onDelete` from `required`, and putting per-dialect
types in the declaration.
