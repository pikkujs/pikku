# Better Auth in Pikku

`@pikku/better-auth` connects a [Better Auth](https://better-auth.com) instance
to a Pikku app. You define the instance once with `pikkuBetterAuth`, and the CLI
generates the rest: the catch-all `/api/auth/**` route, a session middleware,
and a `defineSecret` for `BETTER_AUTH_SECRET` and for each social provider.

The task-oriented guide (setup, providers, 2FA, virtual users, the HTTP
surface) is the `pikku-auth` skill's `references/better-auth.md`. This page
covers the choices that change how a session is resolved and what is safe to
turn on.

## Choosing a session middleware

Each of the three middlewares turns a request into a Pikku session in the same
way. It maps `{ user, session }` to `{ userId, orgId? }` (or your
`mapSession`), stamps `virtualUser` for virtual user rows, and resolves
`scopes` through the registered `ScopeService`. Each one also does nothing in
three cases: an earlier middleware already set a session, the request has no
credential, or the dispatch is an addon's whose scope withholds the auth secret.

| Middleware                          | Where the session comes from                             | Bundles the Better Auth server | When a revoked session stops working |
| ----------------------------------- | -------------------------------------------------------- | ------------------------------ | ------------------------------------ |
| `betterAuthSession()`               | the database, through `services.auth()`                  | yes                            | on the next request                  |
| `betterAuthStatelessSession()`      | the signed `session_data` cookie (`session.cookieCache`) | no                             | when the cookie cache expires        |
| `betterAuthStoreSession({ store })` | Better Auth's `secondaryStorage`                         | no                             | on the next request                  |

The CLI generates `betterAuthSession()` or, when `session.cookieCache` is
enabled, `betterAuthStatelessSession()`, both at `lowest` priority. To pass
other options, register your own globally: it runs first, and the generated one
then does nothing.

### The stateless cookie

`betterAuthStatelessSession` verifies the cookie with the secret alone. It
never builds the auth instance, so it cannot read your Better Auth options and
has to be told the ones that change how the cookie is written:

```typescript
betterAuthStatelessSession({
  // advanced.cookiePrefix, when you set one
  cookiePrefix: 'my-app',
  cookieCache: {
    // session.cookieCache.version, when you set one. Without it, cookies of
    // every version still verify, so a version bump revokes nothing.
    version: '2',
    // Optional. A jwe or jwt cookie is recognised from its shape, and every
    // strategy still verifies against the secret.
    strategy: 'jwe',
  },
})
```

The generated middleware is given `cookiePrefix`, `strategy` and `version`
when they are string literals in your `betterAuth({ ... })` call. When one is
not, the CLI warns, and you register the middleware yourself as above. `jwt`
options are never passed through.

If both the stateless middleware and `pikkuBetterAuth` run in one process,
`pikkuBetterAuth` logs an error at startup when these values disagree with the
auth config.

With no database behind it, `session.cookieCache.maxAge` is a hard session
lifetime. Better Auth defaults it to 300 seconds, so `pikkuBetterAuth` sets it
to a day when the app left it unset. The `SESSION_COOKIE_CACHE_MAX_AGE` stage
variable changes that default.

### Store-backed sessions

Under `secondaryStorage` the session token is the store key, so
`betterAuthStoreSession` resolves a session with one read. Pass it the storage
you pass Better Auth:

```typescript
const storage = inMemorySessionStore() // or your own AuthSessionStorage

betterAuth({ secondaryStorage: storage, plugins: [bearer()] /* … */ })

addGlobalMiddleware([betterAuthStoreSession({ store: () => storage })])
```

The token arrives as `Authorization: Bearer …` (from `bearer()`'s
`set-auth-token`) or on the session cookie, and `transports` limits it to one
of the two. `AuthSessionStorage` is Better Auth 1.7's `SecondaryStorage`
contract: `get`, `set`, `delete`, `getAndDelete` and `increment`. A storage
whose `get` returns parsed objects instead of JSON strings also works.

### Outside a Pikku function

`getAuthSession(auth, request, createConfig, createSingletonServices)` reads the
session in a Next.js route or a TanStack loader. Given a factory, it builds the
singleton services and the instance on the first call and reuses them.

## What is safe to turn on

**Virtual user sign-in** opens under `pikku dev`
(`PIKKU_DEV_VIRTUAL_USER_SIGN_IN=true`, which is ignored under
`NODE_ENV=production`). On a deployed stage it also opens when
`PIKKU_ALLOW_VIRTUAL_USER_SIGN_IN` holds its exact opt-in value. Only `pikku dev`
may create new virtual user rows.

**Delegated login** (`pikkuDelegatedAuth`) creates and links its own users. It
attaches to an existing local user with the same email only when you opt in:

```typescript
pikkuDelegatedAuth({
  // false (default) refuses. 'non-admins' refuses anyone holding an admin or
  // pikku:console scope, and links nobody without a ScopeService.
  // 'all' links anyone.
  linkExistingUsersByEmail: 'non-admins',
  /* … */
})
```

The email still comes from the upstream. Opt in only when the upstream verifies
email addresses.

**Singleton OAuth credentials** belong to a reserved platform user, which is
found by its address `platform@pikku.internal`. So it works under
`advanced.database.generateId: 'uuid' | 'serial'`, where Better Auth assigns its
own ids.

## Moving to 0.13

- `SessionStore` and `InMemorySessionStore` are now `AuthSessionStorage` and
  `InMemoryAuthSessionStorage`. They gained `getAndDelete` and `increment`, so a
  custom implementation has to add both. `inMemorySessionStore()` and
  `prefixedSessionStore()` keep their names.
- `pikkuDelegatedAuth` no longer links by email unless you set
  `linkExistingUsersByEmail`.
- Dev quick login is removed: the `${basePath}/dev/quick-login` route,
  `PIKKU_DEV_QUICK_LOGIN`, and the `admin@pikku.dev` account it created. Sign in
  through your normal sign-in, or `virtualUser()` under `pikku dev`.
- The package no longer imports `@better-auth/core` or `@better-auth/utils`
  itself. It needs only `better-auth` as a peer.
