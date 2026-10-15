---
type: question
title: Why does a static action request skip the user session?
description: staticActionRequest passes skipUserSession true to fetchData, and the code gives no reason for it
tags: [next, sessions, actions]
---

# Why does a static action request skip the user session?

`staticActionRequest` in `packages/runtimes/next/src/pikku-next.ts` (lines 78-95) builds a
`PikkuActionNextRequest` from the route, method and data, with `false` as its last argument
(lines 84-89). It then calls `fetchData` with `skipUserSession: true` and `bubbleErrors: true` (lines 91-94).

The doc comment at line 71 says the route is handled "with user session skipping", and gives no reason.
The method is the static-action entry point, and `packages/runtimes/next/src/pikku-next-worker-rpc.ts`
has its own `staticActionRequest` at line 71, which this note does not read.

Question: is a static action meant to run with no user session by design, and if so, what keeps it
from being reached by a caller who should have one? Nothing in this package records the reason.
