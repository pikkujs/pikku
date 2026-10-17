---
'@pikku/core': patch
---

Internal deduplication in core, with no public API change:

- `authBearer` and `remoteJobsSecret` compare tokens with the shared `timingSafeStringEqual` (UTF-8 bytes) instead of private copies comparing UTF-16 code units.
- One `stableStringify` (sorted keys, otherwise `JSON.stringify` semantics) replaces the two private serializers in queue identity signing and scenario witness comparison. Queue identity signatures are unchanged: the payload is round-tripped through JSON before serialization, so no `undefined` reaches it and the output is byte-for-byte the same. Scenario witness comparison now treats `undefined` inside arrays as `null` and honours `toJSON` (two different `Date`s previously both serialized as `{}` and compared equal).
- The unused `utils/hash.ts` (`canonicalJSON`, `hashString`) is removed; it was not reachable from any entry point.
- The in-flight step-status set and the virtual-user `readObject` helper are defined once.
