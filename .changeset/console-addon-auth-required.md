---
"@pikku/addon-console": patch
"@pikku/cli": patch
---

console addon: require an authenticated session by default

All exposed console RPCs are now `pikkuFunc` (require a session) instead of
`pikkuSessionlessFunc` + `auth: false` — the console is an admin surface, so it
should never be reachable anonymously. The two SSE streaming routes
(`/workflow-run/:runId/stream`, `/function-tests/stream`) stay sessionless, since
their HTTP wiring is intentionally `auth: false`.

Behaviour change for consumers: a host that mounts `@pikku/addon-console` must
provide an authenticated session (e.g. via better-auth) to reach console RPCs —
unauthenticated calls now return `403`. Permission policy on top of "must be
logged in" (admin-only, org scoping, …) remains host-owned via tag/HTTP
middleware; the addon only enforces the baseline.

`@pikku/cli`:

- `pikku all` now **throws** when `scaffold.console` is enabled but no
  `pikkuBetterAuth(...)` is found in the project — scaffolding the console
  without an auth strategy would produce a console that 403s on every call, so
  `scaffold.console` alone is no longer the minimum.
- The scaffolded `console.gen.ts` secret/variable RPCs (`setSecret`, `getSecret`,
  `hasSecret`, `getVariable`, `setVariable`) are now generated as `pikkuFunc`
  (require a session) instead of `pikkuSessionlessFunc` + `auth: false` — these
  read/write secrets and must never be anonymous. The two SSE routes stay
  `auth: false`.
- `scaffold.console` is now always `"auth"` (the `"no-auth"` mode is gone for the
  console): `pikku enable console` writes `"auth"` and ignores `--no-auth`.
