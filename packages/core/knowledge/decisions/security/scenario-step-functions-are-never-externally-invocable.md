---
type: decision
title: Scenario-step functions are never externally invocable over RPC
description: rpcExposed requires expose and rejects scenarioStep, so test steps stay reachable only from inside a scenario run
tags: rpc
---

# Scenario-step functions are never externally invocable over RPC

`ContextAwareRPCService.rpcExposed` in
`packages/core/src/wirings/rpc/rpc-runner.ts` is the entry point for RPCs that
arrive from outside the process. It resolves the function's meta and throws
`RPCNotFoundError` unless `functionMeta.expose` is set **and**
`functionMeta.scenarioStep` is falsy — the same 404 an unknown name gets, so the
existence of a hidden function is not disclosed.

A scenario step is a piece of a test scenario: it may drive a browser, assert
against fixtures, or reach for privileged setup helpers. Steps are dispatched by
name from inside a scenario run through the internal `rpc` path, which does not
consult `expose`. If a step were also reachable from the outside, any caller who
guessed its name would get an unauthenticated handle on test tooling in whatever
environment the scenario code shipped to.

The two conditions are independent and both required: `expose` opts a function
into the external surface, `scenarioStep` opts it back out regardless.

**What this rules out:** collapsing the check to `!functionMeta.expose`,
returning a distinct "forbidden" error that confirms the name exists, and routing
external traffic through `rpc` instead of `rpcExposed` for convenience — `rpc`
performs no exposure check at all.
