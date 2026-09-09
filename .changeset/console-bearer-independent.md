---
'@pikku/better-auth': patch
'@pikku/inspector': patch
'@pikku/cli': patch
---

Deprioritise the generated session middleware instead of skipping it

Two session middlewares were reconciled by having the CLI inspect the app for
its own `betterAuthSession` / `betterAuthStatelessSession` registration and then
generate nothing (pikkujs/pikku#754). That silently dropped everything emitted
alongside — including the `PIKKU_CONSOLE_TOKEN` bearer, so an app that
customized `mapSession` answered `MissingScopeError` on every `console:*` RPC.

All three session middlewares now take a `priority`, and the CLI generates its
registration at `lowest`. An app's own registration defaults to `medium`, so it
resolves the session first and the generated one short-circuits on its existing
`if (session) next()`. Nothing is detected and nothing is skipped;
`state.auth.userStatelessSession` and `state.auth.hasUserSessionMiddleware` are
gone.

`betterAuthSession`, `betterAuthStatelessSession` and the session store now also
carry the organization plugin's `activeOrganizationId` onto `session.orgId`
without a `mapSession`, and `impersonation.loadUser` defaults to better-auth's
own `findUserById` — the two things an app most often wrote a whole `mapSession`
for.
