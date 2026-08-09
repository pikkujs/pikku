---
---

Benchmarks only: `bench-profile-granular.ts` and `bench-profile-hotpath.ts`
reach core and uws-handler through relative paths rather than `./src/*`
subpaths their packages do not map, so both profilers run again. No published
package changes.
