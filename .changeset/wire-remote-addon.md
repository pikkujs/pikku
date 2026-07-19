---
'@pikku/core': patch
'@pikku/inspector': patch
'@pikku/cli': patch
---

Add `wireRemoteAddon` — consume a hosted addon's `remote: true` RPCs transparently over HTTP, with the addon installed as a devDependency (types only). `rpc('ns:fn', input)` dispatches to the host's `/remote/rpc/:rpcName`, authenticating as a client with a token bound from a local source (`{ credentialId }` per-user, `{ secretId }` platform, or a custom `resolve()`), or omitted for a public surface. This is any-machine → hosted-library client auth, distinct from the trusted mesh (`PIKKU_REMOTE_SECRET`). A new `.remote.gen.d.ts` RPC map exposes only the `remote: true` surface to consumers. `pikku` verify errors if a `wireRemoteAddon` package is a production dependency (or missing) instead of a devDependency, and if a bound `credentialId`/`secretId` isn't wired.
