---
'@pikku/inspector': patch
'@pikku/cli': patch
---

fix(auth): skip the generated global `betterAuthSession()` when the user registers their own

The CLI's `auth.gen.ts` unconditionally wired a global
`addHTTPMiddleware('*', [betterAuthSession()])` (default map) on the stateful
path. A project that needs a customized session bridge — `mapSession`,
`impersonation`, `apiKey` — had to register a second global
`betterAuthSession({...})`, leaving two in the chain; the generated default ran
first and short-circuited (`if (session) next()`) so the custom one never took
effect.

The inspector now records `state.auth.hasUserSessionMiddleware` when it sees a
user-authored **global** `betterAuthSession` registration (route-scoped and
`.gen.ts` registrations are ignored, so regeneration never self-suppresses).
The CLI omits its own global `betterAuthSession()` from `auth.gen.ts` when that
flag is set — exactly one session bridge in the chain, the user's. Mirrors the
existing stateless skip (`userStatelessSession`, #754).
