# @pikku/mantine

## 0.12.14

### Patch Changes

- 78237ac: The console shows feature flags as a launch board, and analytics events as a
  declared catalog.

  A flag's state is four fields — `enabled`, `rolloutPercent`, `declared`,
  `backed` — and none of them is the question an operator actually asks, which is
  how far this has got. The board answers that directly: every declared flag sits
  in the lane its rollout has reached, `dark` → `rolling` → `live`, with
  `attention` for the flags that are not resolving in a way anybody chose.

  Attention is evaluated before every other reading, and that ordering is the
  whole point rather than an implementation detail. A flag declared in code with
  no row in the store fails open, and it reports `enabled: true` with no rollout
  limit — byte-identical to a deliberate full launch. Read the fields in the
  obvious order and the one production-severity state on the board renders as the
  healthiest one. `groupFlagsByLane` also returns all four lanes whether or not
  they hold anything, because a board read by shape must not rearrange itself the
  moment a lane empties.

  Selecting a flag opens its controls beside the board rather than over it: the
  switch, the rollout bucket, and the subjects pinned on or off past that bucket.
  They share one surface because they are read together — "off for everyone except
  these three" is a switch and an override row, and an operator who has to leave
  one screen to see the other is the operator who turns a flag on for everybody by
  mistake. The panel tracks the open flag by name and re-reads it from the list, so
  committing a rollout moves the card and the panel together instead of leaving the
  panel describing the flag as it was before the operator changed it.

  A board whose flags come from a `FeatureFlagSource` — a provider Pikku reads but
  does not own — says so and offers no controls, rather than offering controls that
  would fail.

  The analytics screen is a catalog of what the code declares, read from build-time
  meta: the events a client may emit and the props each carries, with every prop
  rendered as the schema source text the declaration wrote. It is deliberately not
  a volume report — nothing here counts what was emitted — and saying which of the
  two it is turned out to be the only design question the screen had.

  Turning a flag on while it carries no rollout limit now asks first. That press
  is the one irreversible thing the board can do — with no bucket left to hold
  anybody back it admits everyone the flag's capabilities allow — and it used to
  be a single click on a switch. The panel also reports what a mutation is doing
  and what it refused to do: the controls it is waiting on go into a pending
  state, and a failed write raises an inline `<Alert>` rather than reverting in
  silence. The console mounts no notification provider, so the feedback is inline
  where the action is, which is the idiom the rest of the console already uses.

  `@pikku/mantine`'s theme gains four aliases, and they close a contrast defect
  that predates this board:

  ```ts
  '--mantine-color-orange-light': 'var(--app-surface-warning)',
  '--mantine-color-orange-light-color': 'var(--app-amber)',
  '--mantine-color-teal-light': 'var(--app-surface-success)',
  '--mantine-color-teal-light-color': 'var(--app-green)',
  ```

  The theme already documents two colour tiers — TEXT must clear AA, GRAPHIC only
  3:1 — and already pulls Mantine's own variables into that contract rather than
  linting call sites. What it had not covered was Mantine's _light variants_:
  `<Alert color="orange">` renders #d9480f on #ffe8cc at 3.62:1, and
  `<Badge variant="light" color="teal">` at 4.33:1, neither reachable from an
  `--app-*` token because the component never asks for one. The ramp itself is
  deliberately untouched: Mantine conflates `--mantine-color-orange-filled`
  between `c="orange"` text and a `variant="filled"` background, so darkening it
  for light-mode text would make an existing filled badge unreadable in dark mode.
  Eight pre-existing `c="orange"` call sites moved onto the amber TEXT tier in the
  same pass.

  The analytics catalog is grouped by the file that declares each event, and its
  rows are real buttons rather than table cells carrying a tabindex.

  `ShellHeaderAction` gains `loading` and `testId`, and `ActionCluster` gains a
  `measurement` flag. `ShellHeader` sizes its actions by rendering them a second
  time off-screen, and that measuring copy was carrying the same `data-testid` and
  `data-help` as the real one — so every action on a page with a collapsing header
  resolved to two elements. The flags board also moved its two header actions from
  `actionsNode` (documented as the non-collapsing escape hatch) onto the structured
  `actions` array, which is what stopped them clipping off the right edge at 400px.

## 0.12.13

### Patch Changes

- 4c7a1b5: Run the monorepo's own scripts through bun instead of yarn. What moves is the
  package manager each package's `prepublishOnly` and build scripts invoke, plus
  the two manifest fixes bun needs to resolve the tree: `uWebSockets.js` is
  declared with an explicit `github:` specifier, and `@pikku/uws-handler` marks
  its `uWebSockets.js` peer optional so a bun install of a consumer that brings
  its own uWS app does not try to fetch it from the registry.

  Three published behaviours change, all of them cases where an isolated
  `node_modules` or bun as the runtime had been papered over by yarn's hoisting:

  - `@pikku/migrator-sql` turns foreign keys on when it opens a sqlite database
    through bun. `node:sqlite` enforces them by default and `bun:sqlite` does not,
    which silently turned every `ON DELETE CASCADE` into a no-op under
    `bunx --bun pikku`.
  - `@pikku/cli` resolves a deploy provider against the project being deployed
    rather than against wherever the CLI itself is installed, which is what its
    own "is not installed" error asks the user to arrange.
  - `@pikku/cli` treats a specifier a runtime hands straight back — bun does this
    for the modules it implements itself — as not resolved from the project, so
    it falls back rather than loading the runtime's own copy.

- Updated dependencies [4c7a1b5]
  - @pikku/react@0.12.11

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
