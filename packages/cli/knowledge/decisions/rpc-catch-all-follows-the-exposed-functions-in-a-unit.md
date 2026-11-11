---
type: decision
title: A deploy unit receives the rpc catch-all only when it contains an exposed function or route
description: Per-unit codegen adds the rpcCaller and /rpc/:rpcName entries only when the unit holds an exposed function or an /rpc route, and the remote handler only for remote ones
tags: cli, deploy, codegen, rpc
---

# A deploy unit receives the rpc catch-all only when it contains an exposed function or route

`packages/cli/src/deploy/codegen/per-unit-codegen.ts` adds catch-all scaffold entries to each
deployment unit based on what the unit contains.

`hasExposed` is true when a function in the unit has `expose`, or when a route in the unit has
`/rpc/` and not `/mesh/rpc/` (`per-unit-codegen.ts:103-108`). When it is true, the unit gets
`rpcCaller`, `/rpc/:rpcName` and `http:post:/rpc/:rpcName` (`per-unit-codegen.ts:113-118`).

`hasMesh` works the same way for `remote: true` functions and `/mesh/rpc/` routes
(`per-unit-codegen.ts:109-111`), and adds the mesh handler entries (`per-unit-codegen.ts:119-124`).

**What this rules out:** giving every deploy unit the rpc catch-all. A unit with no exposed
function gets no catch-all route.
