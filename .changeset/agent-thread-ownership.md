---
'@pikku/core': patch
'@pikku/cli': patch
'@pikku/kysely': patch
'@pikku/redis': patch
'@pikku/mongodb': patch
---

Scope AI agent thread reads to the calling session.

The generated thread-management functions (`getAgentThreads`,
`getAgentThreadMessages`, `getAgentThreadRuns`, `deleteAgentThread`) keyed purely
off a caller-supplied `threadId` and treated `resourceId` as an optional filter,
so omitting it enumerated every tenant's threads.

- `listThreads` gains an `owners` **authorization constraint** (distinct from the
  `resourceId` filter): an empty array matches nothing, and it is always derived
  from the session, never from input. Implemented across the Kysely, Redis and
  MongoDB agent run services, with LIKE/regex metacharacter escaping so an owner
  id containing `_` or `%` cannot match a foreign owner.
- The three `threadId`-keyed functions are now guarded by an `isThreadOwner`
  `pikkuPermission` rather than an in-body check. A thread that does not exist is
  denied rather than 404'd, so it is indistinguishable from one owned by someone
  else.
- New `@pikku/core/ai-agent` helpers: `canAccessThread`, `threadOwnerConstraint`,
  `sessionPrincipals`, `isOwnedByPrincipal`.

Services destructured by a wired function are now non-optional inside it.

The inspector already aggregated the services used by every wired `func`,
`permissions` and `middleware` into `RequiredSingletonServices`, but the
generated function types defaulted their service parameter to the raw `Services`
— so a service declared `foo?: Foo` still arrived as possibly-undefined, forcing
`if (!foo) throw new MissingServiceError(...)` guards that could never fire.
Generated types now expose `WiredSingletonServices` / `WiredServices`
(`RequiredSingletonServices & Services`) and default the `RequiredServices`
generic of functions, permissions, middleware, auth and approval-description
helpers to them. Optionality now means only what it should: "this service may
not be created, because nothing uses it".
