---
type: question
title: Does a non-mesh request need a mesh token once the secret is set?
description: With PIKKU_MESH_SECRET set, pikkuMeshAuthMiddleware refuses any request lacking a Bearer header, not only /mesh/rpc paths; the no-secret branch is path-scoped
tags: core, auth, mesh, middleware
---

# Does a non-mesh request need a mesh token once the secret is set?

`pikkuMeshAuthMiddleware` (`packages/core/src/middleware/mesh-auth.ts`) has
two branches. With no secret, only a path under `/mesh/rpc/` is refused, and
the test "requires authorization for a case-varied mesh path when no secret is
set" pins that. With the secret set, the code reaches
`if (!authHeader) throw new UnauthorizedError()` for every path, because that
check is not gated by `isMeshRpcPath`.

So once the secret is configured, a request to any route the middleware sees and
that carries no Bearer header is refused. The tests in `mesh-auth.test.ts`
only use `/mesh/rpc` paths with the secret set, so they do not show whether
this is meant.

Mounting, checked: in this repo nothing in a template or example mounts
`pikkuMeshAuthMiddleware`. The Pikku Studio Cloud app, which lives outside this
repo, mounts it as wire middleware on one route only, `POST /mesh/rpc/:rpcName`,
not globally. So for that app the question above does not arise, because the
middleware never sees its ordinary routes. The question stands for any app that mounts the middleware globally, which
this repo does not show.

What is asked: should a deployment that sets `PIKKU_MESH_SECRET` refuse its
ordinary public routes as well, or should the secret branch be path-scoped the
way the no-secret branch is? The code does not say which the app expects, and
how the app mounts the middleware is outside this package.
