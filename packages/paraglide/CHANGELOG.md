# @pikku/paraglide

## 0.12.6

### Patch Changes

- ca7c672: feat(paraglide): the i18n-debug mask locale, generated rather than wrapped

  `paraglideMaskLocale` writes a copy of the base catalog with every visible
  character replaced by a block glyph, for Paraglide to compile like any other
  locale. Switch to it and anything still readable on screen never went through a
  message — the hardcoded string that `tsc` and the `@pikku/mantine` `I18nNode`
  gate cannot see, because it sits in plain JSX, an `aria-label`, an `alt` or a
  `document.title`.

  Making the mask a locale rather than a runtime wrapper around the `m` namespace
  is what keeps messages tree-shakeable: a wrapper touches every export. It is
  also free in production — the catalogue is deleted on a build, so Paraglide
  compiles the locale to aliases of the base one.

  `{placeholders}` and whitespace are preserved: a placeholder is a message input,
  not copy, and mangling one changes the compiled function's signature.

## 0.12.5

### Patch Changes

- 13ee73f: fix(paraglide): export the enum generators, not just their types

  The package barrel re-exported `GenerateEnumsOptions`, `EnumGroup` and `DbEnum`
  as types only, so `dist/esm/index.js` compiled down to `export {}` and the
  package had no runtime surface at all. Anything importing `generateEnumsSource`
  or `parseDbEnums` from `@pikku/paraglide` died at load with "does not provide an
  export named 'generateEnumsSource'", and the `exports` map offers no deep path
  to reach them another way — the only consumers that worked were the bundled
  `./vite` plugin and the `paraglide-enums` bin, which import the module directly.
  The barrel now exports `generateEnumsSource`, `parseDbEnums` and
  `collectEnumGroups` alongside the existing types.

## 0.12.4

### Patch Changes

- 786dae5: Bump every dependency whose latest release is a major across the monorepo, and
  port the code the majors broke: `cookie` 2's `parseCookie`/`stringifySetCookie`
  API in `@pikku/core` and the three runtime HTTP adapters, and assistant-ui 0.15's
  store client in `@pikku/assistant-ui`.

## 0.12.3

### Patch Changes

- fd9d834: Stop publishing internals that only their own package or file used. The declarations stay; only the entrypoint re-export is removed, so nothing that imported a name from where it is declared is affected.

## 0.12.2

### Patch Changes

- 41ce2cb: Upgrade to TypeScript 6 and raise the minimum Node.js version to 22.

  All packages now build against `typescript@^6.0.3` and declare `engines.node >= 22`. Internal tooling (`ts-json-schema-generator`, `zod-to-ts`) was bumped to TypeScript 6-compatible releases.

## 0.12.1

### Patch Changes

- de563f1: New package `@pikku/paraglide`: paraglide tooling for pikku apps.

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
