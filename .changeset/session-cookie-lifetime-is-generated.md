---
'@pikku/better-auth': patch
'@pikku/cli': patch
---

The stateless session cookie's lifetime is now declared by the CLI and read by the framework, so an app needs no code of its own to get a session that outlives five minutes.

The previous fix stopped `betterAuthStatelessSession` leaving the cookie on better-auth's 300-second default, but it hardcoded one day. An app that wanted a different lifetime — and it is a real decision, because the lifetime is also the longest a ban or a revoked session can go unnoticed — had to declare a variable, read it, and thread it into its own `betterAuth({ session: { cookieCache } })`. That was the same three edits in every app, which is the shape of something the framework should be doing.

Now:

- **`@pikku/cli`** emits a `SESSION_COOKIE_CACHE_MAX_AGE` variable into `auth-secrets.gen.ts`, on the `cookieCache` branch that already decides whether to split the stateless middleware out. Only that branch: under the stateful middleware the cookie cache genuinely is a cache in front of the database, and a short life there is the correct trade rather than a bug. It is optional, so a deployment that never sets it stays valid.

  The generated schema is `z.string().default('86400')` rather than a coerced number, because `TypedVariablesService` returns a stored host value **unparsed** and runs the declared schema only to resolve a default. A `z.coerce.number()` would never fire on a real value and would only mislead whoever read it.

- **`@pikku/better-auth`** reads that variable when it applies the default, coercing and range-checking it there. A value that is not a positive number of seconds is logged and ignored rather than honoured — a typo should not expire the cookie instantly. An app generated before the CLI emitted the declaration has no such variable, which is the ordinary case and not an error: the one-day default simply stands.

  Insert-not-upsert still holds, and now holds against the variable too. An explicit `session.cookieCache.maxAge` in the app's own config is the author's decision and beats a stage binding.

- **`@pikku/cli`** also generates `useSession` into the react-query hooks file. An app wants the session anyway, and the same query heals the cookie for free: when `session_data` ages out, better-auth's cookie-cache branch bails on the stale payload and falls through to the database, reading the session from the still-valid `session_token` and minting a fresh cookie on the way out. `refetchInterval` and `refetchOnWindowFocus` are react-query's; there is no refresh loop beside them.

  It deliberately does not pass `disableCookieCache`. That would make every refetch a database read — the exact cost the cookie cache exists to avoid — to re-mint a cookie with most of its life left. better-auth's own sliding renewal (`session.cookieCache.refreshCache`) is not an option either: it is force-disabled whenever a database is configured, and where it does apply it re-signs the cached blob without reading the database, so a banned user's cookie would renew forever.

The upshot for an app: `pikku gen`, use `useSession()` where it wants the signed-in user, and delete any hand-rolled equivalent. The app's `betterAuth` config needs no `maxAge`.
