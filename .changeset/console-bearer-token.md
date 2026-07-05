---
'@pikku/core': patch
'@pikku/cli': patch
---

Console: accept `Authorization: Bearer <PIKKU_CONSOLE_TOKEN>`

A console served from another origin cannot carry the session cookie, so
every `console:*` RPC returned 403. `authBearer` gains a secret-resolved
token mode (`token: { secretId, userSession }` — resolved through the
secrets service per request, constant-time compare, no-op while the secret
is unset), and the auth scaffold wires it with `PIKKU_CONSOLE_TOKEN` when
`scaffold.console` is enabled — inside the same `addHTTPMiddleware('*')`
call as the session middleware, since the inspector keys route-middleware
groups by pattern (pikkujs/pikku#886).
Set that secret in the server environment and send it as a bearer token to
authenticate an external console.
