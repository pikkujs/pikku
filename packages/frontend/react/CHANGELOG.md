# @pikku/react

## 0.12.12

### Patch Changes

- 1c9a55a: Analytics can fan out to several destinations, and carry the identity an ad
  platform needs.

  `fanOutAnalytics` composes any number of destinations into one
  `AnalyticsService`, so a single-destination app never meets it and a sink is the
  same class whether it runs alone or beside three others. Destinations are
  settled rather than awaited in sequence: `flush()` runs inside the invocation,
  so a slow vendor must not add its latency to the request and a vendor that is
  down must not cost the others their events.

  Each destination takes an optional `accepts` predicate. Which events a
  destination receives is the app's policy — a product-analytics tool wants
  everything, an ad platform wants three conversions — while what an event should
  look like once it arrives is the sink's, and belongs in its mapper rather than
  in a central mapping table that would push vendor trivia into every app.

  `AnalyticsIdentity` gains `vendorIds` and `consent`. GA4 keys on a `client_id`
  from the `_ga` cookie and Meta on `fbp`/`fbc`; neither is derivable from a user
  id, so a server-side sink without them does not degrade, it sends nothing
  usable. Both are resolved server-side through an `analyticsIdentity` resolver on
  singleton services, never read from the event body — the same rule the rest of
  the identity already follows, so a crafted client call cannot attribute an event
  to someone else. `cookieAnalyticsIdentity` covers the common first-party-cookie
  case; a consent tool that packs every purpose into one encoded blob writes its
  own resolver, which is why the resolver is a function.

  A resolver returns nothing off a wire with no browser behind it, so a cron task
  and a queue worker never invent a vendor id.

  The analytics leaf re-exports the runtime, so an app reaches the whole surface
  through `#pikku/analytics` — wiring where events go sits next to declaring them,
  and splitting that across two specifiers splits one concern across two names.

  Identity the browser owns is resolved server-side, and can now be created there
  too. `cookieAnalyticsIdentity` reads GA4's `client_id` and Meta's `fbp`/`fbc`
  off first-party cookies; `mintCookie` writes one that is not there yet, which is
  what lets an app collect nothing on the page at all. Both formats are public and
  server-side minting is documented by the vendors — it is the mechanism behind
  server-side tagging, offered here as a wired resolver rather than a second
  container to operate.

  Minting is gated on consent, because writing the cookie is itself the act
  consent governs — a minter that runs before the banner is answered has already
  done the thing the send gate was meant to prevent. `composeAnalyticsIdentity`
  exists to make that expressible: resolvers run in order and each sees what the
  ones before it produced, so the reader that finds consent necessarily precedes
  the minter that needs it. Every required purpose must be granted, not any.

  `anonymousAnalyticsIdentity` fills the gap that made anonymous product analytics
  dishonest. `pikkuUserId` is derived from a session and so is absent for exactly
  the visitor it would need to identify, which left a sink choosing between
  collapsing every anonymous visitor into one shared literal and dropping the
  pre-signup funnel entirely. The id is `httpOnly` by default: no browser script
  needs it, and a cookie scripts cannot touch is not subject to the seven-day cap
  browsers place on script-set ones.

  On the client, `createAnalytics` takes an `enabled` predicate checked at each
  flush. A boolean would be captured before anyone had answered the banner, so
  accepting mid-session would never start and withdrawing would never stop.
  Refused events are discarded rather than held, so changing your mind does not
  release a backlog.

- 1c9a55a: Review fixes across the feature-flag and analytics primitives:

  - An addon function's `featureFlag:` gate now reads the consuming application's
    flag source rather than the package's own services, which never carry one.
  - A flag named `__proto__`, `constructor` or `prototype` is rejected instead of
    being silently dropped from the generated metadata.
  - Two declarations of one flag with different descriptions are a hard error,
    rather than the inspector's traversal order deciding what operators read.
  - `subjectIdOf` falls through an empty organization id to the user, instead of
    resolving to no subject and skipping every override and rollout bucket.
  - `CachedFlagSource.invalidate()` retires the in-flight read, so a webhook that
    lands mid-fetch is not answered by the pre-webhook snapshot for another TTL.
  - The generated `/feature-flags` wire resolves against the compiled fallback
    when no source is wired, so a scope-gated flag is not reported to a caller
    who cannot hold it.
  - `pruneFlags()` rechecks `declared = false` in the delete and reports only
    what it removed, so a redeclaration between the two keeps its overrides.
  - A destination's `accepts` throwing no longer costs every later sink its batch.
  - The React analytics client drops events at collection time when analytics is
    disabled, so a later consent grant cannot send what was gathered before it.
  - The React flag client keeps its map when the wire answers a non-object.
  - `KyselyAnalyticsService` mints event ids from `crypto` rather than a
    timestamp with a short random tail.

- 1c9a55a: Feature flags, declared in source and resolved from two independent booleans.

  `defineFeatureFlags` declares a flag the way `defineScopes` declares a scope —
  the inspector collects it, the CLI emits a `FeatureFlagName` union, and a
  misspelled `featureFlag:` is a type error rather than a gate that silently fails
  open.

  A flag answers two questions that are not the same question. `capable` comes
  from the session's scopes and is per-user, advisory, and protects nothing — it
  hides UI. `available` comes from one global config snapshot, is caller-blind,
  and is the only half the runner enforces: `override(subject) ?? (enabled AND
bucket)`, so "off for everyone except these three organizations" is one row, and
  a kill is one write rather than a fan-out. Authorization stays where it was, in
  the function's own `scopes:` — enforcing capability would make a flag a second
  authorization path OR-ing against them. An unavailable feature throws 503, not
  403, because the caller was allowed; the feature was not on.

  `featureFlag:` is deliberately available on sessionless functions too. It reads
  the config, not the session, so the kill switch reaches a cron task, a queue
  worker and a webhook — which is where it matters most, since nobody is watching
  a UI to notice the feature is off.

  Refresh is pull-on-demand, so the TTL is the kill-switch latency. Where that is
  too long, `invalidate()` is public: a provider's change webhook lands on an HTTP
  wiring, drops the cache, and the next request does the read. It deliberately
  does not fetch — a burst of webhooks would be N round trips, and on a serverless
  runtime the isolate that took the signal may be gone before anything reads the
  result.

  Availability fails open through three layers: a fresh read, then the last good
  cached read, then the compiled declaration. The middle layer is load-bearing —
  dropping straight to the compiled fallback on a blip would switch on every flag
  that was deliberately dark.

  Backing stores split along what they can honestly do. `FeatureFlagSource` is
  read-only (`snapshot()`) and is what a third-party provider implements;
  `FeatureFlagStore` adds the write half and is for stores Pikku owns.
  `@pikku/kysely` ships the store, with declarations synced additively — a removed
  declaration is marked undeclared, never revoked, and a sync never re-enables a
  killed flag. Third-party providers implement the read-only half in the addons
  repository, over plain `fetch` rather than a vendor SDK — those poll on a timer
  belonging to a long-lived process, which a serverless isolate cannot hold
  between requests.

  A client asks for its flags once per session rather than per flag:
  `scaffold.featureFlags` generates a `GET /feature-flags` returning every
  declared flag resolved for the caller, keyed by this app's `FeatureFlagName`.
  Generated into the app rather than shipped in an addon precisely for that union
  — an addon never sees the host's, and could only answer
  `Record<string, boolean>`. It returns `show` alone: sending `available` apart
  from `capable` would tell every visitor which features exist but are dark.

  The write half is the operator's, and lives in `@pikku/addon-admin` beside the
  scope RPCs, under a new `admin:flags` scope. `flagList` reports `writable:
false` rather than failing when flags come from a provider, because a provider's
  own UI is its operator surface and a console full of buttons that 500 is worse
  than a read-only tab. It still lists the flags: a source may report its declared
  set through `declaredFlags()`, and each row carries `backed`, false where the
  provider has never heard of a declared flag. That row is the one worth seeing —
  an absent row fails open, so a dark launch nobody created in PostHog is already
  live for everyone, and a store pikku owns can reconcile that on deploy where a
  provider cannot.

  On the client, `createFeatureFlags` fetches that map once and `useFeatureFlag`
  reads it synchronously after, through the same provider the analytics client
  hangs off. It takes a `bootstrap` map so a server-rendered page hydrates onto
  the answer it already computed: without one there is a gap in which neither
  default is right, since false hides a feature the user has and true flashes one
  they do not. A failed refresh keeps the map already on screen rather than
  relabelling every flag on a blip.

## 0.12.11

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
  - @pikku/fetch@0.12.11

## 0.12.10

### Patch Changes

- 1ecf8a1: `usePhotoCapture` — take or choose a photo with no markup to write. `open({ camera: true })` creates the file input, opens the rear camera on a phone (and an ordinary file dialog on the laptop you develop on), and throws the input away again; what comes back is already downscaled and base64-encoded, because a phone frame is several megabytes and every byte of it is paid for on the upload, in the row it is stored in, and again in a vision model's context. Two traps that cost accuracy are handled on the way: EXIF orientation is applied during decode, so a portrait photo does not reach the model on its side, and an iPhone HEIC that `createImageBitmap` refuses falls back to decoding through an `<img>`. `prepareImage(file, options)` does the same work for a file you already have, from a drop target or a paste.

## 0.12.9

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
