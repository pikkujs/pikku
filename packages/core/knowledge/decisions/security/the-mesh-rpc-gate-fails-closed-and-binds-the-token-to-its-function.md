---
type: decision
title: The mesh RPC gate fails closed and binds a token to one function
description: pikkuMeshAuthMiddleware refuses a mesh RPC request unless the mesh token is audience pikku-mesh, names the requested function, and carries a session that decrypts under the mesh secret
tags: core, auth, mesh
---

# The mesh RPC gate fails closed and binds a token to one function

`pikkuMeshAuthMiddleware` (`packages/core/src/middleware/mesh-auth.ts`)
guards the receiving end of a mesh call, which `buildMeshHeaders`
(`packages/core/src/mesh.ts`) signs from the caller side. Where the code and
its tests state a rule:

- With no `PIKKU_MESH_SECRET`, a request whose path is under `/mesh/rpc/` is
  refused. The path check is case-insensitive, and the test
  "requires authorization for a case-varied mesh path when no secret is set"
  says why.
- With the secret set but no JWT service, the middleware throws rather than
  passing the request on.
- A missing header, a scheme other than `Bearer`, a token that fails to decode,
  or an audience other than `pikku-mesh` is `UnauthorizedError`.
- A token carrying `fn` is only accepted for the function it names on a mesh
  path. The test "should skip fn check for non-RPC paths even if fn in token"
  confirms the binding is about the RPC surface.
- The session claim is decrypted under `PIKKU_MESH_SECRET` with
  `MESH_SESSION_INFO`, which `buildMeshHeaders` encrypts. A decryption
  failure is `UnauthorizedError`, so a session is never read as plain claims.

**What this rules out:** accepting a mesh token with the wrong audience, reusing
a token minted for one function on another RPC path, and reading the session
claim without decrypting it. The gap for requests outside `/mesh/rpc/` once the
secret is set is recorded in
[Does a non-mesh request need a mesh token once the secret is set?](../../questions/mesh-secret-refuses-requests-without-a-mesh-token-on-every-path.md).
