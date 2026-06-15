---
"@pikku/core": patch
"@pikku/inspector": patch
"@pikku/cli": patch
"@pikku/auth-js": patch
"@pikku/addon-console": patch
---

fix(inspector): deploy `/auth/*` routes for credentials-only `wireAuth`

A `wireAuth({ credentials, callbacks })` call (email/password, no OAuth
providers) registers its `/auth/*` routes at runtime — `wireAuth` calls
`wireHTTPRoutes` internally via `createAuthRoutes`. The static inspector only
sees the outer `wireAuth(...)` call, so the wiring file was tracked in
`state.auth.files` but never added to `state.http.files`. As a result the file
was never imported into the generated HTTP bootstrap, `wireAuth` never executed,
and the deployed worker had no auth routes (every `/auth/*` request 500'd).

Two coordinated fixes:

- `add-auth`: a providers-less `wireAuth` (credentials/callbacks only) now adds
  its source file to `state.http.files` so it is imported into the bootstrap and
  runs at runtime. The OAuth-provider path is unchanged — those routes are
  emitted into a generated file, and importing the user's source too would
  double-register the routes.
- `filterInspectorState`: runtime-registered `/auth/*` routes never appear in
  the static `http.meta`, so per-unit deploy codegen would drop the auth wiring
  file. It is now re-attached to any unit that still serves HTTP, and kept out of
  units that serve none.
