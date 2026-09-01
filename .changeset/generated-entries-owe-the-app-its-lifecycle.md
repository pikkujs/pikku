---
'@pikku/deploy-standalone': patch
'@pikku/node-http-server': patch
'@pikku/better-auth': patch
'@pikku/bun-server': patch
'@pikku/deploy': patch
'@pikku/cli': patch
---

Run the app's server lifecycle in generated entries, and make an out-of-band
account signable-in.

`pikkuServerLifecycle` was only ever called by `pikku dev` and `pikku serve`, so
an app that seeds its first admin account, probes a dependency, or warms a cache
in `beforeStart` did all of that in development and silently skipped it
everywhere it was actually deployed. The standalone entry and the shared node
server entry — the one behind every `target: 'server'` unit — now import the
app's lifecycle and call it: `beforeStart` after `init` and before the port
opens, so work that must finish before the first request has, `afterStart` once
the server is listening, and the stop hooks handed to the signal handler that
already owns shutdown rather than a second listener racing it. A failing
shutdown hook is logged and the process still stops.

Separately, `createAuthUser` and `setAuthUserPassword` wrote credential accounts
with no `issuer`. From better-auth 1.7 a credential account is matched by its
issuer as well as its provider, so those accounts were invisible to sign-in,
`updatePassword` and `findCredentialAccount` — a user who plainly existed in the
table was reported as "user not found". The field is written only when the
resolved schema has it, so older better-auth keeps working, and
`setAuthUserPassword` repairs an account that predates the fix.
