---
type: decision
title: A disabled function is left out of the build, and anything that still references it fails the build
description: A function declared with disabled true or a reason string is recorded only in functions.disabled, and every reference to it is critical PKU562 naming both sides
tags: inspector, functions, disabled, fail-closed
---

# A disabled function is left out of the build, and anything that still references it fails the build

`disabled: true | 'reason'` on any function definer makes `addFunctions` record the function in `state.functions.disabled` (name, file, exported name, reason) and nothing else (`packages/inspector/src/add/add-functions.ts`). It never reaches `functions.meta`, so no RPC map, client, addon SDK, MCP, CLI or HTTP output can include it. At run time `addFunction` throws for a disabled config (`packages/core/src/function/function-runner.ts`).

A reference to a disabled function is critical `PKU562`, and the message names the disabled function's file and the reference's `file:line` (`packages/inspector/src/add/check-disabled-references.ts`). The check covers:

- an identifier that resolves, through import aliases and shorthand properties, to the disabled function's declaration — a wiring, an agent's tools, an expose list, any other code
- `rpc.invoke('name')` and `rpc.mesh('name')` with a literal name
- a workflow step whose `rpcName` is the disabled function
- a disabled function defined inline in a wiring, which that wiring still uses

A reference inside the disabled function's own definition is not one: its body is dead too.

A `disabled` the build cannot read — anything but `true`, `false` or a non-empty string literal — is critical `INVALID_VALUE` and the function is treated as disabled.

**Why fail closed:** a skipped function whose wiring still compiled would be a route generated against missing metadata, which `ensureFunctionMetadata` would otherwise stub. Refusing the build is the only outcome where "disabled" cannot quietly mean "still reachable".

**What this rules out:** disabling a function without removing what calls it, and computing `disabled` from config or environment.
