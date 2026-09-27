# @pikku/addon-admin

## 0.12.7

### Patch Changes

- 4a9dcd2: `admin:listUsers` now pages, counts and can carry roles.

  `ListUsersInput` gains `offset` and `includeRoles`; `ListUsersOutput` gains `total`, and each `User` gains `roles` and `fields`. `total` is how many users match `search`, which is what a pager counts against — `users.length` never was, because it is capped by `limit`.

  ```typescript
  const { users, total } = await rpc.invoke('admin:listUsers', {
    search: 'example.com',
    limit: 50,
    offset: 50,
    includeRoles: true,
  })
  ```

  Paging only means something over a stable order, so the query now sorts newest first rather than however the database felt like returning rows.

  Synthetic principals — the platform credential owner, Fabric service users, scenario actors — are excluded by the query instead of dropped from the page afterwards. Filtering after the fact broke both halves of paging: `limit` had already counted the rows it then discarded, so a page came back short, and `offset` skipped synthetic rows as though they were people, so the same person could appear on two pages or on none.

  `includeRoles` is refused without `admin:scopes:read`. `admin:users:list` says who may see the directory; it does not say who may see what each of those users can do.

  `ScopeService` gains `listRolesForUsers(userIds)`, implemented in `@pikku/kysely`. It answers for every id asked for — an empty array for a user holding no roles, so a caller cannot read a missing key as "holds nothing" — and chunks its `in` list to stay inside the bound-parameter cap. A page of users used to cost one query per row, which on a database reached over the network is a round trip per row.

  ```typescript
  listRolesForUsers(userIds: string[]): Promise<Record<string, string[]>>
  ```

  Anything implementing `ScopeService` outside this repository has to add it.

- Updated dependencies [4a9dcd2]
- Updated dependencies [5ab24ad]
- Updated dependencies [42b7ac3]
  - @pikku/core@0.12.120

## 0.12.6

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

- Updated dependencies [78237ac]
- Updated dependencies [add56d2]
  - @pikku/core@0.12.111

## 0.12.5

### Patch Changes

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

- Updated dependencies [1c9a55a]
- Updated dependencies [1c9a55a]
- Updated dependencies [1c9a55a]
  - @pikku/core@0.12.110
  - @pikku/better-auth@0.12.42

## 0.12.4

### Patch Changes

- 6cec7da: Tell a console screen whose addon isn't wired apart from one that failed.

  The console UI is a static bundle the CLI serves at `/console`, so every screen
  ships to every deployment — but `@pikku/addon-console` edits source files and is
  normally wired in development only, and `@pikku/addon-admin` is a deliberate
  opt-in. The difference used to surface as whichever request a screen happened to
  fire first failing on its own.

  Each addon now carries a `ping` whose only job is to be found. An unwired addon
  fails name resolution and answers `RPCNotFoundError` (404), which means exactly
  one thing: resolution runs before the session check, so 200, a 401 from
  `wireAddon({ auth: true })` and a 403 all still mean _wired_, and so does a
  network error — the screen renders and reports its own failure rather than
  claiming an addon is missing on a dropped connection.

  `admin:ping` is new; `console:ping` already existed and keeps its `{ pong: true }`
  contract. Screens are gated by group in the router, and the addon setup tab's
  OAuth section — the one admin-backed piece of a console-backed screen — gates
  itself inline.

- 551c173: Invite a user instead of choosing a password for them. `admin:createUser` no longer requires a password — an account created without one has no credential row, so it cannot be signed into — and a new `admin:sendSignInLink` mails that user a magic link. With `magicLink({ disableSignUp: true })` a link only ever admits an email that already has a user row, which makes sending one the invitation. The console's create panel sends the link by default (forced when no password is set) and the row menu can send another, both gated on `admin:users:create`.
- Updated dependencies [551c173]
  - @pikku/better-auth@0.12.39

## 0.12.3

### Patch Changes

- 712991d: Ship the generated `pikku-db-meta.gen.json` in `dist`. `pikku all` writes it
  under `.pikku/addon/db/`, but `tsc` only emits the JSON it sees imported and
  nothing imports this one, so it never reached the published package. Every
  consumer running `pikku db generate` then failed with "does not publish
  .pikku/db/pikku-db-meta.gen.json" — an addon that cannot say whether it ships
  tables — which took out the `ai-postgres`, `remote-rpc-pg` and
  `workflows-pg-boss` templates.
- Updated dependencies [bbb9e3b]
  - @pikku/core@0.12.106

## 0.12.2

### Patch Changes

- 32d1280: Prefix the better-auth plugin factories with `pikku`: `pikkuActor`, `pikkuBan`,
  `pikkuFabric`, `pikkuDelegatedAuth` and `pikkuCredentialOAuth`.

  A `betterAuth({ plugins: [...] })` array mixes this package's plugins with
  better-auth's own, and until now nothing at the call site told them apart —
  `plugins: [actor(...), ban(), fabric(...), organization()]` reads as four
  plugins from one place when only the last is better-auth's. The prefix says
  which package a plugin came from where it is actually wired.

  The old names are still exported as deprecated aliases bound to the same
  functions, so no import has to change. Nothing about the plugins themselves
  moved: the `id` each registers under — `pikku-ban`, `actor`, `fabric`,
  `delegated-auth`, `credential-oauth` — is unchanged, so no deployed database or
  session is affected.

  The pieces that read a plugin's _export_ name rather than its id accept both:
  `PLUGIN_REGISTRY` is keyed under the prefixed and the bare name, and the
  `pikku validate` ban/actor checks and the `scaffold.userAdmin` ban check count
  either spelling as wired. Their messages now point at the new names.

- Updated dependencies [32d1280]
- Updated dependencies [a0ed1e8]
  - @pikku/better-auth@0.12.34
  - @pikku/core@0.12.100

## 0.12.1

### Patch Changes

- 7722ceb: Split the addon leaf so an application cannot shadow a linked addon's own

  An addon authored its services through `#pikku/addon`, and so did an
  application installing one. Node keeps those apart — `#pikku/*` is a
  package-private subpath import, resolved against the addon's own
  `package.json` — but tsconfig `paths` are global to a tsx process, and every
  runtime template maps `#pikku/*` onto a sibling package. A linked addon's
  `#pikku/addon` was resolved against the _application's_ leaf, which holds the
  install half and none of the authoring exports, and every template failed to
  boot with `does not provide an export named 'pikkuAddonServices'`.

  The authoring half now sits at `#pikku/addon/setup`. An application generates a
  flat `.pikku/<leaf>`, so there is nothing there for that specifier to match and
  the resolver falls back to Node, which reads the addon's own imports. Addons
  declaring themselves import `pikkuAddonConfig`, `pikkuAddonServices` and
  `pikkuAddonWireServices` from `#pikku/addon/setup`; `wireAddon` and
  `wireRemoteAddon` stay at `#pikku/addon`.

  `wireAddon` and `wireRemoteAddon` also move off `@pikku/core/rpc` onto
  `@pikku/core/addon`. Being reached over rpc is how an addon is called rather
  than what it is, and it put the whole addon surface behind the rpc subpath for
  consumers that only wanted to install one.

- 20d8a39: Split application administration out of the console addon into a new
  `@pikku/addon-admin`.

  `@pikku/addon-console` reads generated metadata, project source and knowledge
  notes from disk, so it only ever runs where there is a project checkout and a
  dev server. That made the console the only way to reach capabilities that have
  nothing to do with a console — listing users, composing roles, granting scopes,
  managing credentials, reading the audit trail — none of which touch a
  filesystem. Those now live in `@pikku/addon-admin`, which depends on nothing but
  `@pikku/core` and `@pikku/better-auth` and can be wired into a deployed
  serverless unit:

  ```ts
  wireAddon({ name: 'admin', package: '@pikku/addon-admin' })
  ```

  It ships the user directory (`admin:listUsers`, `createUser`, `setUserBanned`,
  `removeUser`, `revokeUserSessions`, `setUserPassword`), role and scope
  administration, credential administration and the audit trail.
  `console:getMyAccess` stays where it is: the console reads it to decide what to
  render, and it must not need a second addon wired to boot.
  Each function carries its own `admin:*` scope; the addon deliberately declares
  no `scopes` on `wireAddon`, because addon scopes are required _in addition to_ a
  function's own and an addon-level `admin` would force the umbrella grant on a
  caller granted only `admin:users:list`.

  Breaking for anyone calling these RPCs by name or granting their scopes:

  - `console:getAudits`, `console:getAuditFilters`, `console:scope*` and
    `console:credential*` are now `admin:*`.
  - `pikku:console:audit:read` is now `admin:audit:read`,
    `pikku:console:scopes:{read,manage}` are now `admin:scopes:{read,manage}`, and
    `pikku:console:credentials:{read,manage}` are now
    `admin:credentials:{read,manage}`.
  - The `admin` scope tree gains `credentials:{read,manage}`, `scopes` and
    `audit`. A bare `admin` grant now also covers reading the audit trail and
    administering roles; a role that means to exclude those must spell out the
    leaves it wants.
  - `scaffold.console` gates the console addon on `pikku:console` rather than
    `admin`, since `admin` is now the other addon's tree, and `@pikku/console`'s
    own `AuthGate` requires the same root (`isAdmin` on the auth context is now
    `canUseConsole`). Grant `pikku:console` to whoever should reach the console —
    the two are separate decisions, and a host may hand someone the console
    without handing them the user directory.

  `credentialListUsers` now reports the credentials each user actually holds
  rather than a matrix against the declared set, which is what removed its last
  dependency on the on-disk metadata.

  The `scaffold.userAdmin` generator is superseded by the addon and left in place
  for hosts still on it. Its copy of the `admin` scope tree — and the one exported
  as `ADMIN_SCOPE_TREE` from `@pikku/better-auth` — stay byte-identical to the
  addon's, as pikku still requires of a shared scope root.

- 20d8a39: Drop better-auth's `admin()` plugin.

  `admin()` bundles three unrelated things: a `role` column, fifteen HTTP
  endpoints authorized against that column, and the enforcement that stops a
  banned user from getting a session. Pikku only ever wanted the third. The
  endpoints were never reachable directly — each sat behind a pikku function with
  its own `admin:users:*` scope — so all the plugin added was a second gate on a
  column that had to be kept in step with the scopes it duplicated. That sync
  (`syncProjectedAdminRole`, run on every authenticated request) is now gone
  along with the column.

  User administration is implemented against better-auth's internal adapter
  instead, exported from `@pikku/better-auth` so `@pikku/addon-admin` and the
  `scaffold.userAdmin` generator share one implementation:

  ```ts
  import {
    createAuthUser,
    deleteAuthUser,
    revokeAuthUserSessions,
    setAuthUserBanned,
    setAuthUserPassword,
  } from '@pikku/better-auth'
  ```

  Ban keeps its schema and its enforcement, in a plugin that does nothing else:

  ```ts
  import { ban } from '@pikku/better-auth'

  betterAuth({ plugins: [ban()] })
  ```

  `ban()` adds `banned`, `banReason` and `banExpires` to `user`, refuses to create
  a session for a banned user, and lapses an expired ban at the sign-in that would
  otherwise be refused. It makes no authorization decision of its own, so it never
  needs to know about scopes.

  Breaking:

  - Remove `admin()` from your better-auth `plugins`, and add `ban()` if you ban
    users. `pikku db generate` writes the migration; `user.role` and
    `session.impersonatedBy` are no longer declared by anything.
  - `callAdminApi`, `AdminApiHttpWire`, `syncProjectedAdminRole`,
    `projectedAdminRole` and `ADMIN_ROLE_SCOPES` are removed. `ADMIN_SCOPES`,
    `ADMIN_SCOPE_ROOT` and `ADMIN_SCOPE_TREE` are unchanged.
  - The `scaffold.userAdmin` codegen no longer fails without `admin()`. It now
    fails only when there is no better-auth at all, and warns when `ban()` is
    missing — banning is one capability of six, so the other five still generate.
  - The scope on each function is now the whole authorization decision. Anywhere
    that relied on `user.role` as a backstop no longer has one.

- Updated dependencies [7722ceb]
- Updated dependencies [375c1ff]
- Updated dependencies [20d8a39]
- Updated dependencies [02a70cd]
- Updated dependencies [aeef159]
- Updated dependencies [a281de6]
- Updated dependencies [266e3bc]
- Updated dependencies [02a70cd]
- Updated dependencies [786dae5]
- Updated dependencies [6eef0a0]
- Updated dependencies [20d8a39]
- Updated dependencies [3561d67]
- Updated dependencies [a91c433]
- Updated dependencies [02a70cd]
- Updated dependencies [9537f74]
- Updated dependencies [2b57ca8]
- Updated dependencies [266e3bc]
- Updated dependencies [9fce0f1]
- Updated dependencies [83683a0]
- Updated dependencies [456c88b]
- Updated dependencies [456c88b]
- Updated dependencies [c127273]
  - @pikku/core@0.12.85
  - @pikku/better-auth@0.12.26
