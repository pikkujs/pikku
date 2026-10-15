---
type: decision
title: The remote RPC gate fails closed and binds a token to one function
description: pikkuRemoteAuthMiddleware refuses a remote-RPC request unless the mesh token is audience pikku-remote, names the requested function, and carries a session that decrypts under the mesh secret
tags: core, auth, remote
---

# The remote RPC gate fails closed and binds a token to one function

`pikkuRemoteAuthMiddleware` (`packages/core/src/middleware/remote-auth.ts`)
guards the receiving end of a mesh call, which `buildRemoteHeaders`
(`packages/core/src/remote.ts`) signs from the caller side. Where the code and
its tests state a rule:

- With no `PIKKU_REMOTE_SECRET`, a request whose path is under `/remote/rpc/` is
  refused. The path check is case-insensitive, and the test
  "requires authorization for a case-varied remote path when no secret is set"
  says why.
- With the secret set but no JWT service, the middleware throws rather than
  passing the request on.
- A missing header, a scheme other than `Bearer`, a token that fails to decode,
  or an audience other than `pikku-remote` is `UnauthorizedError`.
- A token carrying `fn` is only accepted for the function it names on a remote
  path. The test "should skip fn check for non-RPC paths even if fn in token"
  confirms the binding is about the RPC surface.
- The session claim is decrypted under `PIKKU_REMOTE_SECRET` with
  `REMOTE_SESSION_INFO`, which `buildRemoteHeaders` encrypts. A decryption
  failure is `UnauthorizedError`, so a session is never read as plain claims.

**What this rules out:** accepting a mesh token with the wrong audience, reusing
a token minted for one function on another RPC path, and reading the session
claim without decrypting it. The gap for requests outside `/remote/rpc/` once the
secret is set is recorded in
[Does a non-remote request need a remote token once the secret is set?](../../questions/remote-secret-refuses-requests-without-a-remote-token-on-every-path.md).
