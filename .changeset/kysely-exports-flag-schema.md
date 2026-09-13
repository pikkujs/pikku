---
'@pikku/kysely': patch
---

Export `flagSchema` beside the other schemas.

`KyselyFeatureFlagStore.init()` expects its tables to exist, and the only way
an app creates them is `applyPikkuSchemas(db, [flagSchema])`. Every other store
in this package exports the schema that backs it; this one did not, so the
store was unusable outside the package that defined it.
