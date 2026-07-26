---
'@pikku/cli': minor
---

`pikku db check` now tells a table the pikku runtime created apart from one nobody can explain.

`db check` reports tables in the database that no migration creates. Until now every table a `@pikku/kysely` service bootstrapped at boot landed in that bucket, alongside genuine leftovers — which is noise, and the wrong conclusion, because for those the remedy is known.

The runtime's declaration (`pikkuSchemas`, new in `@pikku/kysely`) is now used to recognise them, and they are reported separately with the fix: `pikku db generate` writes them down so the schema stops depending on which services happened to start.

Recognising, not requiring — absence of a runtime table is not a finding. A project that never constructs the workflow or AI services is not missing their tables.

Run against a real project this correctly attributed nine tables: four workflow tables in `app`, and five AI tables that a `pikku dev`/`pikku serve` connection had created unqualified in `public`, shadowing the `app` ones its migrations own.
