---
type: decision
title: A local RPC is a span of its own
description: A function called in-process gets a new span under its caller. A call that leaves the process keeps the caller's span, because the next process needs a parent that exists.
tags: core, rpc, observability
---

# A local RPC is a span of its own

Every hop gets a new span, and a function called over `rpc` is a hop even though
it stays in the process. Sharing the caller's span made two functions
indistinguishable in a trace, so `rpc()` gives the local function a child span.

A mesh or remote addon call does not make one. Nothing records the span of a call
that only leaves the process, so naming it as the callee's parent would point at
a span nobody saw. The callee's parent is the function that called.

`rpcWithWire` leaves the wire alone. A workflow passes the span of the step, and
[a run owns its trace](a-workflow-run-owns-its-trace.md).
