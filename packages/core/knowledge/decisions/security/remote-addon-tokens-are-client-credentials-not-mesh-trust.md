---
type: decision
title: Remote addon tokens are client credentials, not mesh trust
description: wireRemoteAddon authenticates as a client to a hosted library and fails closed on an empty token; it never uses PIKKU_REMOTE_SECRET
tags: rpc
---

# Remote addon tokens are client credentials, not mesh trust

`resolveRemoteAddonToken` in
`packages/core/src/wirings/rpc/remote-addon-auth.ts` resolves the bearer token a
`wireRemoteAddon` consumer sends to the host. This is a **client** authenticating
to a hosted library — it is not pikku's trusted machine-to-machine mesh, which
uses `PIKKU_REMOTE_SECRET`. Conflating the two would hand a third-party addon
host a credential that grants mesh-level trust inside the consumer's own
deployment.

The consumer binds the addon's declared auth requirement to one of three local
sources: `credentialId`, a per-user credential read through `wire.getCredential`
and therefore scoped to `pikkuUserId`; `secretId`, a platform key from the
secrets service; or `resolve`, a custom escape hatch. The resolved token is never
logged or traced. Binding a `credentialId` without a wire that supports
credentials throws rather than falling back to a shared secret.

Resolution fails closed. `null` is returned only when no auth is bound at all,
which is the addon declaring its remote surface public. Once auth _is_ bound, a
resolved value of `null`, `undefined` or `''` raises `RemoteAddonAuthError` (401)
instead of dispatching an unauthenticated request that the host might accept as
anonymous.

**What this rules out:** defaulting to `PIKKU_REMOTE_SECRET` or any ambient
credential when the bound source comes up empty, treating an empty token as
"public", and adding the token to log lines, trace headers or error messages for
debugging.
