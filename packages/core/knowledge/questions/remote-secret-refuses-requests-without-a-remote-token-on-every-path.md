---
type: question
title: Does a non-remote request need a remote token once the secret is set?
description: With PIKKU_REMOTE_SECRET set, pikkuRemoteAuthMiddleware refuses any request lacking a Bearer header, not only /remote/rpc paths; the no-secret branch is path-scoped
tags: core, auth, remote, middleware
---

# Does a non-remote request need a remote token once the secret is set?

`pikkuRemoteAuthMiddleware` (`packages/core/src/middleware/remote-auth.ts`) has
two branches. With no secret, only a path under `/remote/rpc/` is refused, and
the test "requires authorization for a case-varied remote path when no secret is
set" pins that. With the secret set, the code reaches
`if (!authHeader) throw new UnauthorizedError()` for every path, because that
check is not gated by `isRemoteRpcPath`.

So once the secret is configured, a request to any route the middleware sees and
that carries no Bearer header is refused. The tests in `remote-auth.test.ts`
only use `/remote/rpc` paths with the secret set, so they do not show whether
this is meant.

Mounting, checked: in this repo nothing in a template or example mounts
`pikkuRemoteAuthMiddleware`. The Pikku Studio Cloud app, which lives outside this
repo, mounts it as wire middleware on one route only, `POST /remote/rpc/:rpcName`,
not globally. So for that app the question above does not arise, because the
middleware never sees its ordinary routes. The question stands for any app that mounts the middleware globally, which
this repo does not show.

What is asked: should a deployment that sets `PIKKU_REMOTE_SECRET` refuse its
ordinary public routes as well, or should the secret branch be path-scoped the
way the no-secret branch is? The code does not say which the app expects, and
how the app mounts the middleware is outside this package.
