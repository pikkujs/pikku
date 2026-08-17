---
'@pikku/addon-admin': patch
'@pikku/addon-console': patch
'@pikku/better-auth': patch
'@pikku/console': patch
'@pikku/cli': patch
---

Split application administration out of the console addon into a new
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
no `scopes` on `wireAddon`, because addon scopes are required *in addition to* a
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
