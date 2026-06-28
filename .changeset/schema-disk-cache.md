---
'@pikku/inspector': patch
'@pikku/cli': patch
---

perf(inspector,cli): persist generated TS schemas to disk across runs

`generateAllSchemas` already cached its `ts-json-schema-generator` output
in-memory (keyed by the generated custom-types content), so the 2nd and 3rd
inspector passes within a single `pikku all` were near-free. But the cache
never survived the process, so every fresh `pikku all` paid the full cold cost
of building a second TS program + running ts-json-schema-generator — on a
331-function project that's ~2.2s, the single largest line item of a run.

The cache is now also persisted to disk (`node_modules/.cache/pikku/ts-schemas.json`,
gitignored by convention), keyed by a hash of the custom-types content plus the
generator options that affect output. A warm `pikku all` whose function types
are unchanged loads the schemas from disk and skips schema generation entirely;
the cold first pass drops by ~3.4s in practice (it also primes the in-memory
cache for the re-inspect passes). Zod schemas are still regenerated every run
(already ~1ms each). Output is byte-identical to a cold run (verified across the
full generated tree). The key is derived from the same content the in-memory
cache uses, so any type change busts it. It also folds in the `@pikku/inspector`
package version, so upgrading the inspector (the channel a schema-format change
ships through) auto-invalidates every cache; `SCHEMA_CACHE_VERSION` remains a
manual lever for in-development format changes between releases.

Opt-out: omit `schemaConfig.cacheDir` (the CLI sets it by default).
