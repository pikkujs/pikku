---
'@pikku/cli': patch
---

Fail `pikku fabric validate` when a deployed frontend does not derive its API base from the page origin.

Nothing writes a `VITE_*` / `NEXT_PUBLIC_*` variable at build time, and nothing
can: the stage hostname is chosen when the worker is published, after the bundle
is built. Fabric binds `VITE_API_URL` as a runtime binding on the deployed
worker, which `import.meta.env` cannot see — so in the shipped bundle the read
is `undefined` and whatever follows it is the real answer.

That makes every build-time env read for an API base a failure, not just the
ones defaulting to localhost:

- `?? 'http://localhost:3002'` — errors as `frontend-env-fallback-localhost-<slug>`.
  Every call from a real browser hangs until it times out, with nothing in any
  log, because the request never left the visitor's machine.
- `?? '/api'`, or no fallback at all, or a `NEXT_PUBLIC_*` name nothing binds —
  errors as `frontend-api-base-not-derived-<slug>`, naming the variable the app
  actually read.
- A bare hardcoded localhost URL — now an error rather than a warning.

All three are suppressed when the frontend reads `location.origin` somewhere:
there the env read is the override branch of an answer that is already correct.
That is the fix in every case, and what fabric's own app template does — the app
and the API share a hostname and the dispatcher claims `/api/*` on it, so
`location.origin + '/api'` is right on a stage, a preview and a custom domain
alike.

Only deployable declared frontends are scanned. Tests, `.d.ts` files and comments
are skipped: none of them reach a browser.
