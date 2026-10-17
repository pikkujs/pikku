---
'@pikku/better-auth': patch
'@pikku/skills': patch
---

Harden `@pikku/better-auth` for 0.13.

**Breaking:**

- `SessionStore` and `InMemorySessionStore` are renamed to `AuthSessionStorage` and `InMemoryAuthSessionStorage`, so they no longer clash with `@pikku/core`'s unrelated `SessionStore`. The interface is now better-auth 1.7's `SecondaryStorage` contract and adds `getAndDelete` and `increment`, so a custom implementation must provide both. `inMemorySessionStore()` and `prefixedSessionStore()` keep their names, and the in-memory store can be passed directly as `secondaryStorage`.
- `pikkuDelegatedAuth` no longer links an upstream identity to an existing local user with the same email unless you set `linkExistingUsersByEmail`. With `'non-admins'` it refuses anyone holding an `admin` or `pikku:console` scope, and links nobody when there is no ScopeService. With `'all'` it links anyone.
- Dev quick login no longer creates `admin@pikku.dev` with the fixed password `pikku-dev-password`. Before each quick login it sets the account's password to a random value generated per process, so `/sign-in/email` can't be used to sign into it. That includes accounts left in older dev databases.

**Fixes:**

- The package no longer imports `@better-auth/core` or `@better-auth/utils`, which were only devDependencies. Under pnpm, isolated bun or Yarn PnP, `import '@pikku/better-auth'` used to fail at load time.
- The tarball ships only `dist`, `README.md` and `LICENSE`. The build clears `dist` and the tsbuildinfo first, so modules that were removed (fabric, actor, provision-personas) can no longer ship. Adds a `types` export condition.
- `betterAuthStoreSession` now shares its session handling with the other two middlewares. It never overwrites a session that an earlier middleware set. It stands down when an addon's scope withholds the auth secret. It reads relayed cross-site cookies and reports an impersonation header that nothing is configured to honour. It also accepts storages that return parsed objects, treats a malformed `expiresAt` as expired, and takes a `cookiePrefix`.
- `betterAuthStatelessSession` recognises `jwe` and `jwt` cookie-cache strategies from the cookie's shape, and takes `cookiePrefix` and `cookieCache: { strategy, version, jwt }`. `pikkuBetterAuth` logs an error at startup when these disagree with the auth config.
- `PIKKU_DEV_VIRTUAL_USER_SIGN_IN` is ignored under `NODE_ENV=production`.
- Dev quick login also refuses `Sec-Fetch-Site: cross-site` and non-loopback `Origin` headers.
- The singleton-credential platform user is now found by its reserved email (`PLATFORM_USER_EMAIL`, `findPlatformUserId`). Under `generateId: 'uuid' | 'serial'`, every link used to create another Platform user.
- `getAuthSession(factory, …)` builds the singleton services and the auth instance once, not once per call.
- The option types that appear in public signatures are now exported. Unneeded `as any` casts are removed, and TSDoc is added to every export.
