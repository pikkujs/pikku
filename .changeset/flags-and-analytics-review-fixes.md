---
'@pikku/core': patch
'@pikku/cli': patch
'@pikku/kysely': patch
'@pikku/react': patch
---

Review fixes across the feature-flag and analytics primitives:

- An addon function's `featureFlag:` gate now reads the consuming application's
  flag source rather than the package's own services, which never carry one.
- A flag named `__proto__`, `constructor` or `prototype` is rejected instead of
  being silently dropped from the generated metadata.
- Two declarations of one flag with different descriptions are a hard error,
  rather than the inspector's traversal order deciding what operators read.
- `subjectIdOf` falls through an empty organization id to the user, instead of
  resolving to no subject and skipping every override and rollout bucket.
- `CachedFlagSource.invalidate()` retires the in-flight read, so a webhook that
  lands mid-fetch is not answered by the pre-webhook snapshot for another TTL.
- The generated `/feature-flags` wire resolves against the compiled fallback
  when no source is wired, so a scope-gated flag is not reported to a caller
  who cannot hold it.
- `pruneFlags()` rechecks `declared = false` in the delete and reports only
  what it removed, so a redeclaration between the two keeps its overrides.
- A destination's `accepts` throwing no longer costs every later sink its batch.
- The React analytics client drops events at collection time when analytics is
  disabled, so a later consent grant cannot send what was gathered before it.
- The React flag client keeps its map when the wire answers a non-object.
- `KyselyAnalyticsService` mints event ids from `crypto` rather than a
  timestamp with a short random tail.
