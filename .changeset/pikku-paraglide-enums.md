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
} satisfies EnumI18n<'idle' | 'backlogged'>
export type HealthKey = keyof typeof health
// usage: health[value]()
```

Ships a Vite plugin (`@pikku/paraglide/vite` — place after `paraglideVitePlugin`,
regenerates on catalog edits) and a standalone CLI (`paraglide-enums <catalog> <out>`)
for CI / non-Vite flows.
