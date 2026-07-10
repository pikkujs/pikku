---
'@pikku/cli': patch
---

Fix pathologically slow `pikku db migrate` schema introspection on Postgres. Column and foreign-key introspection previously fanned out one query per table via `Promise.all` on a single `pg.Client`, which serialized every round-trip (emitting the `client.query() while already executing` deprecation warning) and scaled O(tables). It now issues a single set-based `information_schema` sweep for all columns and all foreign keys, turning introspection into a constant number of round-trips regardless of schema size. SQLite is unaffected (its introspection is synchronous and in-process).
