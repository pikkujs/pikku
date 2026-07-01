# @pikku/react

## 0.12.5

### Patch Changes

- 41ce2cb: Upgrade to TypeScript 6 and raise the minimum Node.js version to 22.

  All packages now build against `typescript@^6.0.3` and declare `engines.node >= 22`. Internal tooling (`ts-json-schema-generator`, `zod-to-ts`) was bumped to TypeScript 6-compatible releases.

- Updated dependencies [41ce2cb]
  - @pikku/fetch@0.12.6

## 0.12.4

### Patch Changes

- 68c69b5: **Breaking:** removed the react-i18next shim. The `@pikku/react/i18n` subpath export (`useI18n()`, `I18nProvider`) and the `i18next`/`react-i18next` peer dependencies are gone. `@pikku/react` now contributes only the i18n _brand_ (`I18nString`, `I18nNode`, `asI18n`) from the package root; apps own their reactive locale store via a Paraglide JS scaffold (`m()` / `useLocale()`). Migrate `const { t } = useI18n()` call sites to Paraglide's `m`. The brand is structurally Paraglide's `LocalizedString`, so `m()` satisfies the `@pikku/mantine` gate natively.
- 15bf10a: `I18nString` is now branded with the string literal `'LocalizedString'` (`string & { readonly __brand: 'LocalizedString' }`) instead of an internal `unique symbol`. This makes it **structurally identical to Paraglide JS's `LocalizedString`**, so a Paraglide `m()` message satisfies the brand — and the `@pikku/mantine` i18n gate — natively, with no wrapper and with full per-message tree-shaking. Backward compatible: `asI18n()` / `t()` still produce `I18nString`, and bare `string` is still rejected by the gate (it has no `__brand`). A new type-level test in `@pikku/mantine` pins the brand literal so a future Paraglide rename fails loudly.

## 0.12.3

### Patch Changes

- 485f876: feat(react,mantine): i18n brand types + zero-runtime Mantine overrides

  `@pikku/react` now exports the i18n brand types `I18nString` / `I18nNode` and the
  `asI18n()` escape hatch from its main entry (pure, no react-i18next dependency).
  The `useI18n` hook and `I18nProvider` move to the new `@pikku/react/i18n` subpath,
  which declares `i18next` / `react-i18next` as optional peers — consumers that only
  need the brand never pull them in.

  New package `@pikku/mantine` (`@pikku/mantine/core`) is a drop-in for
  `@mantine/core` (peer `^8 || ^9` — type contract verified against both 8.3.x and
  9.3.x) that adds zero runtime: it re-exports the real Mantine
  component values and only re-casts their types so every string-bearing prop
  (`children`, `label`, `placeholder`, `title`, `aria-label`, …) requires the branded
  `I18nString` / `I18nNode` instead of a bare `string`. Polymorphism (`component=`)
  and compound statics (`Menu.Item`, `Tabs.List`, `Menu.Divider`, …) are preserved.

- Updated dependencies [409ec80]
  - @pikku/fetch@0.12.3

## 0.12.2

### Patch Changes

- 9060165: New realtime events system: `pikku realtime` generates a typed `PikkuRealtime` client that pairs with `PikkuRPC`. A `/events` channel can be scaffolded to fan out server events to subscribers over SSE. `pikku dev` wires `LocalEventHubService` automatically so realtime works out of the box locally. The React provider exposes `PikkuRealtime` alongside `PikkuRPC`.
- Updated dependencies [9060165]
- Updated dependencies [9060165]
  - @pikku/fetch@0.12.2

## 0.12.1

### Patch Changes

- Fix `@pikku/fetch` dependency to use npm version range instead of workspace protocol.

## 0.12.0

### Minor Changes

- React bindings for Pikku: `PikkuProvider`, `usePikkuFetch`, `usePikkuRPC`, and `createPikku` helper.
