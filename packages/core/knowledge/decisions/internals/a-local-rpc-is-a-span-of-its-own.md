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

A call through the `DeploymentService` (mesh, or an unregistered function that
falls back to it) is a `client` span `rpc.call <name>` under the caller, and the
remote callee is that span's child. The local callee adds nothing extra: it is
already its own span. A remote addon call over HTTP does not make one yet.

The span name carries the function name only when it is a plain identifier
(letters, digits and `_ . : @ / -`, up to 128 characters). Anything else is
unbounded data, so the span is named `rpc.call` and `rpc.service` is
`deployment`. A failed call records the error class only: a transport error can
carry a connection URL with credentials.

`rpcWithWire` leaves the wire alone. A workflow passes the span of the step, and
[a run owns its trace](a-workflow-run-owns-its-trace.md).
