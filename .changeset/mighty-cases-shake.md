---
'@pikku/cli': minor
---

Add `pikku db check` — report how the configured database differs from the schema its migrations define.

Answers the question nobody can otherwise answer without going and looking by hand: does this database still match what we wrote down? It applies the migrations to a throwaway database (the same scratch mechanism `db codegen` uses) and diffs that against the real one.

The two halves are deliberately asymmetric. Missing tables and columns mean the database is behind — the fix only ever adds, so the command fails and tells you to run `db migrate`. Tables the migrations never mention are reported but never fail and never dropped: something created them outside the migration history, and no migration can know whether they hold data worth keeping.

Comparison is on the fully-qualified name, so a second copy of a table in the wrong schema (`public.orders` shadowing `app.orders` — what a runtime that forgot to qualify its DDL leaves behind) is reported rather than mistaken for the table the migrations created.
