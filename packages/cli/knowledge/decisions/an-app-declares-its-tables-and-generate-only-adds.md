---
type: decision
title: An app declares its tables in db/tables.ts and generate only ever adds
description: db/tables.ts is a PikkuSchema with annotations, materialised on a throwaway database and diffed against the migrations; only additions are written, everything else is refused, and the -- pikku:tables marker tells a removal from a table never declared
tags: cli, db, migrations, safety
---

# An app declares its tables in db/tables.ts and generate only ever adds

`db/tables.ts` exports `tables`, a `PikkuSchema` plus `annotations`. Its presence is
the opt-in. It reuses `PikkuSchema` rather than a column DSL because that is the one
declaration mechanism Pikku already has; addons hand-write SQL per dialect, so there
was no addon declaration format to share. `planDeclaredTables` in
`packages/cli/src/functions/db/local-db.ts` applies it to a throwaway database, reads
the result back, and diffs that against what the migrations build.

Other schema sources are a package's published schema, so a column they stopped
writing is dropped on their behalf. This one is the project's data, and a missing
column may be a slip, so it writes additions only. Everything else comes back in
`GenerateResult.refusals` and writes nothing. Refusals are returned, not thrown, so
migrations already written for other sources are still reported.

A passing migration is rehearsed on a copy of the migrations and diffed again, which
catches what no comparison can see, such as sqlite rejecting a `UNIQUE` column on
`ADD COLUMN`.

Generated migrations carry a `-- pikku:tables` marker listing what was declared. Without
it a table that left the declaration cannot be told from a hand-written table that was
never in it. The migrations are labelled `app-tables` and stay app-owned in provenance.

**What this rules out:** generate dropping or renaming anything, and a second way of
declaring tables beside `PikkuSchema`.
