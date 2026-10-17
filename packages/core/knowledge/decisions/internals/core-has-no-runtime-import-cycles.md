---
type: decision
title: Core has no runtime import cycles; mutual recursion is reached lazily
description: The rpc runner reaches the function runner, and an agent's sub-agent tool reaches the agent runners, through a dynamic import, so no module is part of a static cycle
tags: core
---

# Core has no runtime import cycles

Two pairs of modules genuinely call each other. A function calls others through
`wire.rpc`, which the rpc runner serves by running a function. An agent's
sub-agent tool, built in `agent-prepare.ts`, runs another agent on the runners
that built the tool.

Both are broken the same way: the side that is always async reaches the other
through `await import(...)`. `rpc-runner.ts` caches the function runner after
the first call. Neither side is registered in state on import, because then
something would have to guarantee the registering module is loaded: an
HTTP-only deploy never imports the rpc wire, yet every function's `wire.rpc`
needs it.

The helpers both sides shared moved to leaves instead:
`compensation-name.ts` and `channel-middleware-runner.ts` sit at the root of
`src/`, beside `middleware-runner.ts`.

Enforced by `wirings-stay-decoupled.test.ts`: no module may be in a static
value-import cycle, the areas of core (each wire, each top-level directory,
each root file) may form no cycle beyond the pinned
`KNOWN_AREA_CYCLES`, and code outside `wirings/` may reach only the wires in
`FOUNDATION_ALLOWED`.

**What this rules out:** a value import from a wire back into a module that
imports it, and "registering on import" as the fix for one.
