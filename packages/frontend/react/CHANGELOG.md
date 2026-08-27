# @pikku/react

## 0.12.8

### Patch Changes

- 239332b: Move first-party product analytics out of application code and into the framework.

  `createAnalytics<Event>({ endpoint })` in `@pikku/react` is the buffered beacon client: it is typed against the app's own event union, flushes on an interval, on size and on `pagehide`/`visibilitychange` (via `sendBeacon`, so the abandon-point events survive unload), never surfaces a failure to the user and never retries. It also carries the delegated `data-analytics-click` listener, registered in the capture phase so a component calling `stopPropagation()` cannot silence instrumentation, and merging `data-analytics-meta` from ancestors with nearest-wins. Put the client on the Pikku instance and `usePikkuAnalytics<Event>()` reaches it from the provider, alongside `usePikkuFetch` and `usePikkuRPC`.

  `requireOrigin()` in `@pikku/core/middleware` is a server-side origin lock for any unauthed route, and is re-exported from the generated `#pikku/middleware` leaf alongside `cors`. Unlike `cors()` — which only sets response headers a non-browser client ignores — it rejects with a 403 before the function body. Comparison is exact on the parsed origin, so `https://evil-myapp.com` cannot suffix-match `myapp.com`, and a missing `Origin` is rejected because a real browser always sets one on a cross-origin-capable POST. Allowed origins default to the request's own host and can be extended with a list or a resolver over services. `isAllowedOrigin` and `toOrigin` are exported for direct unit testing.

  Together these let an app keep only its event registry and its wiring, instead of a few hundred lines of copied transport.

## 0.12.7

### Patch Changes

- 8acb43f: feat(react): `createLocaleStore` — the locale store every frontend was hand-writing

  Measured across five apps, 35 of ~52 non-comment lines of `src/i18n/config.ts`
  were identical, and two of the five were byte-identical. What was duplicated is
  not app config but a store: the active locale, a listener set, the
  `useSyncExternalStore` hook, the RTL check, a persisting setter and a
  non-persisting one, and the `overwriteGetLocale` bridge that points Paraglide's
  `getLocale()` at all of it.

  The bridge is why this mattered. It is one line and the least obvious one, and
  an app that copied the store but dropped it renders one locale while believing
  in another — which is exactly what happened. Copy-paste loses the interesting
  line first.

  What stays in each app is what actually differs: its locale list, its storage
  key, and its `detectInitialLocale` policy. `overwriteGetLocale` is injected
  rather than imported, so the package takes no dependency on one app's compiled
  Paraglide output.

## 0.12.6

### Patch Changes

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
