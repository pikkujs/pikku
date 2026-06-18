# @pikku/mantine

## 0.12.5

### Patch Changes

- 50a96f8: Improve Fabric validation fix hints for coding agents and add `lineBreaks` plus numeric `Text` children support in Mantine.

## 0.12.4

### Patch Changes

- ee48848: Replace `workspace:` protocol ranges in published dependency fields with literal
  version ranges. Our publish path (`changeset publish`) does **not** rewrite the
  workspace protocol, so these leaked verbatim into npm:
  - `@pikku/cli` declared `@pikku/better-auth: "workspace:*"` in `dependencies`,
    which shipped to `0.12.36` and made it uninstallable for any consumer that
    doesn't already pin better-auth (`@pikku/better-auth@workspace:*: Workspace
not found`).
  - `@pikku/mantine` declared `@pikku/react: "workspace:^"` in `peerDependencies`
    (leaked as a peer warning rather than a hard failure).

  Both now use literal caret ranges, matching every other `@pikku/*` dependency.
  A `scripts/check-no-workspace-protocol.mjs` guard now runs as a `validate-deps`
  CI job (and gates `yarn release`) to fail the build if a `workspace:` range ever
  appears in a published dependency field again (`devDependencies` are exempt —
  they are stripped on publish).

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

- Updated dependencies [485f876]
  - @pikku/react@0.12.3
