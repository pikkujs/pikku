---
type: decision
title: The per-invocation rpc view is a class, because an object literal with a getter is slow to build
description: An accessor declared on an object literal is defined per instance, which drops the literal off V8's fast construction path — measured at 1.15µs against 0.47µs, on every request
tags: core, rpc, performance
---

# The per-invocation rpc view is a class

`getContextRPCService` builds `wire.rpc` once per invocation. It used to return
an object literal, and that literal declared `get agent()` so the agent facade
stayed lazy — most requests never touch it, and reading it builds five closures.

The laziness is right. Declaring the accessor *on the literal* was not: a
literal containing an accessor needs a real property descriptor per instance,
which takes it off V8's fast object-literal construction path and slows the
whole object, not just the accessor.

Measured with `benchmarks/bench-profile-granular.ts`, three runs each:

| shape | per call |
| --- | --- |
| object literal with `get agent()` | 1.106 / 1.433 / 1.147 µs |
| class with `agent` on the prototype | 0.523 / 0.461 / 0.525 µs |

Roughly 2.4×, well outside the run-to-run variance, on a path every request
takes. On the same machine a full `fetchData` measures 12–19µs, so this was on
the order of a tenth of a request spent constructing one object.

The obvious alternative is worse. Making `agent` an eager property removes the
accessor but builds those five closures unconditionally, and measured *slower*
than the original at 1.967µs. A prototype accessor is the only shape that keeps
the laziness and the fast construction path.

**What this rules out:** "simplifying" `ContextRPCView` back to an object
literal. It reads as the plainer option and costs double. It also rules out
trusting a synthetic microbenchmark here — a standalone benchmark of these
shapes pointed at the eager version, because its stand-in for the agent getter
was too cheap to represent the real one. The numbers above come from the
profiler running the real code.
