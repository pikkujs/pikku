---
'@pikku/cli': patch
---

The generated per-unit runner applies the app's column coercion map. When the map is non-empty and a `defineProvider` provides `kysely`, the runner wraps that service so the `kysely` it returns carries `createCoercionPlugin` from `@pikku/kysely`, before any service that needs `kysely` runs. This holds for every deploy provider, and a baseline `kysely` is left to the entry. A single-unit deploy build reads the map too.
