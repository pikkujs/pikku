---
'@pikku/paraglide': patch
---

New package `@pikku/paraglide`: paraglide tooling for pikku apps.

Generates a typed enum-lookup module (`i18n-enum.gen.ts`) from `enum__<group>__<member>`
message keys, so apps replace dynamic `mKey(...)` lookups with static, exhaustive maps:

```ts
export const health = {
  idle: m.enum__health__idle,
  backlogged: m.enum__health__backlogged,
} satisfies EnumLabel<'idle' | 'backlogged'>
export type HealthKey = keyof typeof health
// usage: health[value]()
```

Reconciles the catalog against the database: point it at the pikku CLI's generated
DB enums module (`enums.gen.ts` — Postgres native enums and SQLite `CHECK (col IN (…))`
alike) via `enumsFile`/`enumsImport`, and each catalog group whose member set exactly
matches a DB enum is typed `satisfies EnumLabel<DbEnum>`. The label map then **is** the
reconciliation — a `Record<DbEnum, …>` is exhaustive, so the catalog drifting from the DB
(or `en.json` missing a key) is a compile error naming the gap. A DB enum with no group is
emitted as its own label map (referencing keys you must add) or warned (`unmatchedDbEnums`);
a group with a member the DB lacks gets a drift warning.

Ships a Vite plugin (`@pikku/paraglide/vite` — place after `paraglideVitePlugin`,
regenerates on catalog/enums edits) and a standalone CLI
(`paraglide-enums <catalog> <out> [messagesImport] [enums.gen.ts]`) for CI / non-Vite flows.
