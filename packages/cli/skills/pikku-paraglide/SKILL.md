---
name: pikku-paraglide
description: 'Generate typed, static enum-label maps for a Paraglide i18n frontend with `@pikku/paraglide`, and reconcile them against the database enum columns so a label can never silently drift from a DB value. Enum-valued labels live under a reserved `enum__<group>__<member>` message namespace; the generator emits `i18n-enum.gen.ts` typed `satisfies EnumLabel<DbEnum>`. TRIGGER when: labelling an enum/status/kind/role value in a Paraglide app, replacing a dynamic `mKey(...)`/`m[...]` lookup with a static map, wiring `@pikku/paraglide` into Vite, or reconciling i18n against `CHECK (col IN (...))` / Postgres enum columns. DO NOT TRIGGER for plain free-text UI copy (that is a normal `m.some_key()` message), backend errors, or logs.'
installGroups: [core]
---

# Pikku Paraglide enum labels

## Agent Operating Procedure

Use this as an execution checklist, not reference material.

1. **Is the value an enum (a closed set — a status/kind/role/tag from a DB column or a fixed union)?** Then its label is a static map entry, never a dynamic lookup. Add `enum__<group>__<member>` keys to the catalog (`messages/en.json`) and read the value through the generated map: `group[value]()`.
2. **Is the value free text or a one-off literal** (a heading, a button, a never-indexed label)? Then it is a normal Paraglide message — call `m.<key>()` directly. Do **not** invent an enum group for something that is always a literal.
3. **Wire the generator** (`@pikku/paraglide/vite` or the CLI) so `i18n-enum.gen.ts` is regenerated from the catalog, and point it at the DB enums module (`enums.gen.ts`) so the maps are typed against the database.
4. **Validate with the app's own `tsc`.** Reconciliation is enforced purely by types: a missing key or a dropped DB member is a compile error, and the deploy gate runs `tsc` before building. A clean `vite build` alone does not type-check.

## The rules that don't change

- **Never resolve an enum key dynamically.** No `mKey('status.' + value)`, no `m['enum__status__' + value]()`, no `mExists`/`mList` helpers. Dynamic keys can't be type-checked or tree-shaken. Everything is a static `m.<literal>()` reference, generated into the map.
- **The `enum__<group>__<member>` namespace.** `__` separates the prefix / group / member segments; a single `_` joins words _within_ a segment (`enum__booking_status__form_received`). The prefix (`enum`) and separator (`__`) are configurable but leave them at the defaults.
- **Members must be valid JS identifiers.** Spell out leading digits — `two_guests`, not `2_guests`. The generator quotes an invalid member as a fallback but warns you to rename it.
- **`asI18n(...)` is only for opaque server data** (names, slugs, ids returned from the API). Never `asI18n()` a hardcoded English string or an enum value — an enum value goes through its label map.

## The generated module

`i18n-enum.gen.ts` is **AUTO-GENERATED — do not edit.** It exports, per enum group:

```ts
import { m } from './messages.js'
import type { I18nString } from '@pikku/react'
import type { BookingStatus } from '#pikku/db/enums.gen' // when reconciled

export type I18nMessage = () => I18nString
export type EnumLabel<E extends string> = Record<E, I18nMessage>

export const bookingStatus = {
  enquiry: m.enum__booking_status__enquiry,
  reserved: m.enum__booking_status__reserved,
  confirmed: m.enum__booking_status__confirmed,
} satisfies EnumLabel<BookingStatus>
export type BookingStatusKey = keyof typeof bookingStatus
```

- Each value is an `I18nMessage` — a `() => I18nString` accessor. **Call it at render time** so the label tracks the active locale.
- App code: `import { bookingStatus } from './i18n/i18n-enum.gen'` then `bookingStatus[value]()`.
- For an open server value, gate it: `value in bookingStatus ? bookingStatus[value as BookingStatusKey]() : asI18n(value)`.

### Module-scope hazard — store the accessor, don't call it

A label used in a config built at module load (nav items, column defs) must hold the **accessor**, not the result — calling `m.foo()` at module scope freezes the label to the locale that was active at import:

```ts
// nav.config.ts
const items = [{ label: m.common__nav__items__dashboard /* ← reference */ }]
// at render: <span>{item.label()}</span>   // ← call here
```

## Reconciliation against the database

The DB column is the real source of truth for what an enum can be. The pikku CLI's db codegen emits a bare unions module — `.pikku/db/enums.gen.ts` — covering **both** Postgres native enums and SQLite `CHECK (col IN ('a','b',…))` constraints:

```ts
export type BookingStatus =
  | 'enquiry'
  | 'reserved'
  | 'confirmed'
  | 'ended'
  | 'cancelled'
```

Point `@pikku/paraglide` at that file (`enumsFile`) and each catalog group whose member set **exactly matches** a DB enum is typed `satisfies EnumLabel<DbEnum>`. The label map then **is** the reconciliation — no separate assertion:

- catalog drops a DB member, or `en.json` is missing the key → `m.enum__…` doesn't exist / `Record<DbEnum,…>` isn't exhaustive → **`tsc` error naming the gap**.
- a DB enum with **no** catalog group → `unmatchedDbEnums: 'emit'` (default) generates a label map referencing `enum__<table>_<column>__<member>` keys, so `tsc` tells you exactly which keys to add; `'warn'` only reports it.
- a group with a member the DB lacks (a _derived_ UI state, e.g. a `waitlisted` view of a `pending` row) → a drift warning. Make that a **standalone `m.<key>()` message**, not an enum member — the enum group must mirror the DB column exactly.

Labelling an enum that's never rendered costs nothing: Paraglide compiles only the messages actually referenced, so unused labels are tree-shaken away. So label every DB enum; don't add an opt-out.

**To make a column an enum**, give it a closed domain in the migration so codegen can see it:

- SQLite: `status TEXT NOT NULL CHECK (status IN ('enquiry','reserved','confirmed'))`
- Postgres: a native `CREATE TYPE … AS ENUM (…)` column.

## Wiring

### Vite (dev + build)

Place `paraglideEnums` **after** `paraglideVitePlugin` (the generated file imports the compiled `m`). It regenerates on catalog/enums edits and only writes on change, so it never loops HMR.

```ts
import { paraglideVitePlugin } from '@inlang/paraglide-js'
import { paraglideEnums } from '@pikku/paraglide/vite'

export default defineConfig({
  plugins: [
    paraglideVitePlugin({
      project: './project.inlang',
      outdir: './src/paraglide',
    }),
    paraglideEnums({
      catalog: './messages/en.json',
      outFile: './src/i18n/i18n-enum.gen.ts',
      enumsFile: './packages/functions/.pikku/db/enums.gen.ts', // reconcile against the DB
      // enumsImport: '#pikku/db/enums.gen',  // explicit specifier; defaults to a relative path
    }),
  ],
})
```

### CLI (CI / non-Vite), run right after `paraglide-js compile`

```sh
# paraglide-enums <catalog.json> <out.gen.ts> [messagesImport] [enums.gen.ts]
paraglide-enums ./messages/en.json ./src/i18n/i18n-enum.gen.ts ./messages.js ./packages/functions/.pikku/db/enums.gen.ts
```

`i18n-enum.gen.ts` is generated — gitignore it once the plugin/CLI runs in the build.

## What NOT to do

- Don't write `mKey`/`mList`/`mExists` or any `m[expr]()` dynamic lookup — every enum label is a static generated reference.
- Don't introduce a literal-key indirection helper (`k('approve_enquiry')`); a literal is `m.approve_enquiry()` directly.
- Don't call `m.foo()` at module scope for config built at import time — store `m.foo` and call it at render.
- Don't put an extra UI-only member into an enum group to match a derived state — make it a standalone message and keep the group an exact mirror of the DB column.
- Don't hand-edit `i18n-enum.gen.ts` or `enums.gen.ts` — fix the catalog / the migration and regenerate.
