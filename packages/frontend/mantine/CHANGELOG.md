# @pikku/mantine

## 0.12.8

### Patch Changes

- 0273e51: Require Mantine 9; drop the Mantine 8 peer range.

  `@pikku/mantine` re-exports `@mantine/core` wholesale (`export * from
'@mantine/core'`), so its `^8 || ^9` peer range was never really satisfiable in
  both directions: the set of exported names differs between the majors, and any
  consumer symbol that exists in only one of them resolves for one peer and fails
  for the other. `@pikku/console` sat on the v8 side of that split — it imported
  `TypographyStylesProvider`, which v9 renamed to `Typography` — so installing it
  alongside Mantine 9 failed at bundle time with two missing exports:

      "TypographyStylesProvider" is not exported by @pikku/mantine/core
      "createOptionalContext" is not exported by @mantine/core   (via @mantine/code-highlight@8)

  The second came from `@mantine/code-highlight`, which `@pikku/console` pinned
  to `^8.3.18` while the host resolved core to 9 — a v8 satellite calling a core
  helper that v9 removed. Pinning every `@mantine/*` dependency to the same major
  is what makes that class of error impossible, so all eight move together.

  Consumers on Mantine 8 must upgrade to 9 alongside this release. The migration
  in this repo was small: `TypographyStylesProvider` → `Typography` (2 files) and
  `<Collapse in>` → `<Collapse expanded>` (3 files). No other v9 breaking change
  was reachable — no `createPolymorphicComponent`, `positionDependencies`, `Grid
gutter`, `Text`/`Anchor` `color`, or affected hooks (`useFullscreen`,
  `useResizeObserver`, `useMouse`, `useMutationObserver`, `useTree`).

## 0.12.7

### Patch Changes

- 9292668: Extend the i18n type gate to more `@mantine/core` components. `@pikku/mantine/core` already re-exports every Mantine component via `export *`; this adds branded (`I18nString`/`I18nNode`) prop overrides for text-bearing components that previously slipped through the gate and accepted raw strings:
  - Leaf/prose text: `Highlight`, `Blockquote`, `Mark`, `Pill`
  - Accessibility text: `Avatar` (`alt`), `Image` (`alt`), `Burger` (`aria-label`)
  - Input wrapper: `PillsInput` (`label`/`description`/`error`) and `PillsInput.Field` (`placeholder`)
  - Compound: `List.Item`, `Timeline.Item` (`title`), `Combobox.Option`/`Combobox.Empty`, and `Input.Wrapper`/`Input.Label`/`Input.Description`/`Input.Error`/`Input.Placeholder`

  Components whose only visible text is a numeric value formatter (`Slider`, `RingProgress`, `SemiCircleProgress`, `AngleSlider`), non-linguistic content (`Code`, `Kbd`), or a `data[]` option array (`SegmentedControl`, `Tree`) are intentionally left ungated, matching how the existing `Select`/`MultiSelect` overrides leave option `data` untouched.

## 0.12.6

### Patch Changes

- 41ce2cb: Upgrade to TypeScript 6 and raise the minimum Node.js version to 22.

  All packages now build against `typescript@^6.0.3` and declare `engines.node >= 22`. Internal tooling (`ts-json-schema-generator`, `zod-to-ts`) was bumped to TypeScript 6-compatible releases.

- Updated dependencies [41ce2cb]
  - @pikku/react@0.12.5

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
