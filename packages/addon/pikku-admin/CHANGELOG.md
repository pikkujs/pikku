# @pikku/addon-admin

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
