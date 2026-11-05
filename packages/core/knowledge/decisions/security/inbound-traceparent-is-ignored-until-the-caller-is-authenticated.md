---
type: decision
title: An inbound traceparent is ignored until the caller is authenticated
description: Public HTTP starts a new trace unless trustInboundTraceparent is set; only pikkuMeshAuthMiddleware continues one, after the mesh token verifies
tags: http
---

# An inbound traceparent is ignored until the caller is authenticated

`resolveHTTPTrace` in `packages/core/src/trace.ts` runs before any auth, so it
cannot know who sent `traceparent`. It starts a new trace unless the deployment
set `trustInboundTraceparent`. A trace id flows into logs, audit rows and
`errorId`, and the flags byte decides sampling, so honouring the header by default
would let any client choose those values.

`pikkuMeshAuthMiddleware` is the one place core knows the caller: it calls
`adoptTraceparent` after the `pikku-mesh` token has verified, so a mesh hop keeps
its trace. The adoption mutates `wire.trace` in place because `fetchData` holds
that object for `errorId` and its runner logs.

**What this rules out:** treating a header as proof a call is internal, including
`x-pikku-remote-contract`, which any client can send. A remote addon call sends
`traceparent` too, but its host authenticates it with app-defined auth core cannot
inspect, so the host starts a new trace unless it sets `trustInboundTraceparent`.
