---
'@pikku/kysely': minor
'@pikku/cli': minor
---

Add a `db.schema` CLI config option, so `pikku db generate` can write the runtime tables into a named postgres schema.

Without it the generator emits unqualified `create table` against the default `search_path` of `"$user", public`. A project that keeps everything in one namespace — `app`, say — gets a second copy of every runtime table in `public` alongside the ones it already has, which is how stray `public.ai_*` tables appear next to the real `app.ai_*` ones.

`compilePikkuSchemas` takes the schema and binds only the rendered SQL, never the caller's connection: that connection is the throwaway database the declaration was just applied to, and qualifying it would create tables in a schema the scratch database has never heard of.

Raw SQL is not rewritten by `withSchema`, so `rawStatement` now also accepts a builder taking a `SchemaContext` — the expression index on `credentials` uses it to qualify its own table. Statements otherwise pick the context up from whatever connection they are handed, so a schema-bound connection needs nothing said twice.

Two fixes fall out of it:

- The `ALTER TABLE` delta for a partially covered source is written from bare introspected names, so it is qualified explicitly. Unqualified it altered a table in whichever schema `search_path` found.
- A source was only counted as partially covered on an exact name match, so a project whose migrations already create `app.workflow_step` read as "nothing covered" and had its whole schema re-emitted over tables that were already there. It now matches the schema qualifier the same way the drift diff does.

`db.schema` is postgres only, and is rejected with an explanation on sqlite, whose `REFERENCES` clause takes a bare table name.
