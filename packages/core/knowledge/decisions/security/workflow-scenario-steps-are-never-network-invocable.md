---
type: decision
title: A scenario step is never registered as a callable RPC and never dispatched on the queue
description: A step drives a browser and holds an actor's session, so exposing it as an RPC would put that reach on the network
tags: workflow
---

# A scenario step is never registered as a callable RPC and never dispatched on the queue

`ScenarioStepMeta` in `dsl/workflow-dsl.types.ts` is a distinct meta type from
`RpcStepMeta` on purpose. A scenario step runs locally through `runPikkuFunc`
and must never be treated as dispatchable on the queue or replay path, nor
registered as a callable RPC — a browser-driving step must not be
network-invocable. It executes with a browser handle and an actor's
authenticated session in hand; exposed as an RPC it would hand a remote caller
that reach.

`PikkuScenarioService.scenarioStep` reflects this at runtime: it always runs
through `engine.inlineStep` with `runPikkuFunc`, never through `rpcStep`, so no
transport is involved. A step declaring `browser: true` is refused outright
unless both a browser provider is registered and an actor was supplied, with an
error saying which is missing.

Scenario steps are also modelled as sessionless pikku functions (see
`scenario-step.test.ts`) because a step is driven by an actor, not by a wire
session.

**What this rules out:** collapsing `ScenarioStepMeta` into `RpcStepMeta`,
registering step functions in the RPC map so they "can be tested directly",
routing a scenario step through `rpcStep`/`dispatchStep`, or defaulting a
`browser: true` step to run without an actor.
