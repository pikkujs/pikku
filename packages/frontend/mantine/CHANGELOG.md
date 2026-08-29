# @pikku/mantine

## 0.12.12

### Patch Changes

- 7a15c9c: An actor credential is one persona's, not everyone's

  `SCENARIO_ACTOR_SECRET` was a skeleton key. Anyone holding it could post any
  `actor: true` address to `/auth/sign-in/actor` and get that persona's session —
  including the `admin` persona, which provisioning grants real admin. The browser
  switcher held it too, baked into the dev bundle as `VITE_SCENARIO_ACTOR_SECRET`,
  so "the reviewer can sign in as each kind of user" and "the reviewer's bundle is
  entitled to every persona" were the same fact.

  It is now a root that credentials derive from, never one that is presented:

  ```ts
  deriveActorSecret(root, email) // HKDF-expanded HMAC-SHA256 over the address
  ```

  The endpoint re-derives the expected value for whichever address is signing in
  and compares, so nothing is stored or looked up, a credential minted for one
  persona is refused for every other, and rotating the root invalidates all of
  them at once. The root itself is no longer a valid credential, and a root under
  32 characters refuses the endpoint rather than deriving weak credentials from
  it — the server log says why, the client is not told.

  What that buys, in the places that used to need the whole key:

  - **`pikku dev`** mints one credential per declared persona into
    `VITE_DEV_ACTOR_SECRETS` and no longer writes `VITE_SCENARIO_ACTOR_SECRET` at
    all. The root stays on the server.
  - **`pikku persona secret <id>`** mints them for anything else, and a run given
    `PIKKU_PERSONA_SECRETS=id=secret,…` can sign in as those personas and no
    others — asking for one outside the list throws naming the persona instead of
    falling back to the root.

  `useDevActors()` and `<DevActorSwitcher />` take `secrets` (one per address)
  where they took `secret`, and an actor with no credential is no longer offered
  rather than rendering a row that 401s. `HttpPersonasConfig.secret` and the
  Playwright provider's `secret` additionally accept a resolver, which is how a
  partially-credentialled run is expressed.

- Updated dependencies [7a15c9c]
  - @pikku/react@0.12.9

## 0.12.11

### Patch Changes

- 29309e2: Add `original` to the inputs, marking a value that no longer matches the one it came from. Pass what a field started as and it borders itself orange once it differs — a runtime row against what the repository declares, a form field against what it held when it loaded, a setting against its seeded default. All the same comparison, so nothing about where the other value came from reaches the component.

  On every control that carries a value, so wiring `original` through is never a question of whether this particular input supports it, and `modifiedStyles` is exported for anything doing its own rendering. Toggles read `checked` and hide the input they would otherwise be drawn on, so `Switch` marks its track and `Radio` its circle. `FileInput` is left out: its value is a `File`, and every `File` compares equal.

  These are the package's first runtime wrappers on inputs — the other overrides are type-only casts — so they forward refs explicitly. A control given no `original`, or styling its own input with a `styles` function, behaves exactly as Mantine's does.

## 0.12.10

### Patch Changes

- 6eef0a0: Bump every dependency to its latest compatible minor/patch across the monorepo.
- 3b1164a: feat(react,mantine): ship the dev actor switcher instead of making every app copy it

  The dev-only "Sign in as …" control — one click signs in as a declared scenario
  persona, no password — was hand-copied into every app that needed it, because
  `pikku fabric validate` requires any frontend with a login screen to have one.
  The `devActors()` / `signInAsActor()` pair was byte-identical everywhere it
  landed, including the `import.meta.env.DEV` gate that keeps the shared secret out
  of production bundles. That is not a thing each app should be re-deriving from a
  copy-paste.

  Split along the dependency line:

  - `@pikku/react` gains `useDevActors()`, `signInAsActor()` and `parseDevActors()`.
    UI-free, so it stays inside the package's react-only dependency budget.
  - `@pikku/mantine/dev` gains `<DevActorSwitcher />`, built on that hook. It is a
    new entry point rather than part of `/core`, because `/core`'s contract is
    "drop-in alias for `@mantine/core`" and exporting a component Mantine has no
    counterpart for would break it.

  The component takes `onSignedIn` rather than depending on a router, and the
  actors/secret are passed in rather than read from env — how env is spelled is a
  bundler fact (`import.meta.env.VITE_*` vs `process.env.NEXT_PUBLIC_*`), and a
  package that guesses gets it wrong for half its consumers.

  The skills document it in the four places an agent would look: `pikku-better-auth`
  for the `actor` plugin's endpoint (which had only `/dev/quick-login` before, and
  so sent agents to the wrong control), `pikku-scenario` for the actor list being
  the same one a human signs in through, `pikku-react` for the hook, and
  `pikku-fabric` for the validate rule that requires it.

  `fabric validate` now also accepts a `useDevActors()` call site as evidence the
  control is wired, so apps that want their own UI on the shared logic pass. The
  hand-rolled shape still passes too — nothing existing breaks. Its fix text no
  longer tells you to hand-write the helper, which would have become wrong advice
  the day this shipped.

- Updated dependencies [3b1164a]
  - @pikku/react@0.12.6

## 0.12.9

### Patch Changes

- 255d636: feat(mantine): publish the console colour contract as `@pikku/mantine/theme`

  Two consoles draw the same product and each had its own token set. The console's
  lived in a `--app-*` block inside its `ThemeProvider`; the contract that governs
  those names — which role each token plays, which pairs are allowed to differ,
  and a `node --test` file enforcing it — lived in a private fabric package. So
  the rules existed for one of the two consoles, and the other accumulated names
  with no role behind them (`--app-glass-bg`, `--app-rail-bg`, `--app-accent-bar`).

  `@pikku/mantine/theme` is that contract, as a subpath export of a package both
  consoles already depend on. `createCssVariablesResolver(overrides)` builds the
  resolver, so an embedding app restates only the tokens it genuinely differs on
  rather than a whole palette — and pikku's brand blue turned out to already BE
  fabric's accent, so the console overrides nothing.

  The test ships with it and is parameterised by `THEME_CONTRACT_ROOTS`, so each
  consumer runs the same rules over its own tree: every `--app-*` referenced
  anywhere is defined, no second name for one colour, no feature-scoped prefixes.

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
