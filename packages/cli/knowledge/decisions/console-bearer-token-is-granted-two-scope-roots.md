---
type: decision
title: The console bearer token is granted the admin and pikku scope roots only
description: An external console authenticates with PIKKU_CONSOLE_TOKEN as a bearer, which resolves to a session with admin and pikku scopes, and the token is a no-op while the secret is unset
tags: cli, auth, console, bearer
---

# The console bearer token is granted the admin and pikku scope roots only

`serializeAuthGen` in `packages/cli/src/functions/wirings/auth/serialize-auth-gen.ts` emits an
`authBearer` middleware for the `PIKKU_CONSOLE_TOKEN` secret when `includeConsoleToken` is set
(`serialize-auth-gen.ts:86-96`). The comment says external consoles on another origin cannot
carry the session cookie, so they authenticate with that bearer (`serialize-auth-gen.ts:70-73`).

The session it produces has `userId: 'pikku-console-token'` and scopes `['admin', 'pikku']`
(`serialize-auth-gen.ts:90-93`). The comment says those two roots cover every scope the
console's own functions require, and that a `*` would hand the token every scope the host
app declares (`serialize-auth-gen.ts:74-85`).

The middleware is added in the stateful branch (`serialize-auth-gen.ts:325`) and in the
stateless branch (`serialize-auth-gen.ts:376`).

**What this rules out:** a console token that carries a wildcard or every host scope, and a
console token that works without its secret being set.
