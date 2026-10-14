---
type: decision
title: A scenario run refuses every internal RPC, workflow start and agent call that is not made as an actor
description: The CLI scenario runner passes a guard RPC that throws on invoke, remote, exposed, startWorkflow and the agent methods, so app calls in a scenario go out as an actor over HTTP
tags: cli, scenarios, workflow, actors
---

# A scenario run refuses every internal RPC, workflow start and agent call that is not made as an actor

The scenario runner runs steps in the CLI process. Its comment says everything a step touches in the app goes over HTTP through an actor, and that `guardRpc` is what enforces this (`packages/cli/src/functions/commands/scenario.ts:393-398`).

`refuseInternal` throws for any name. The message says a scenario tried to run an internal step, and that each `workflow.do` must carry `{ actor: actors.x }` (`scenario.ts:414-420`).

`guardRpc` sends `invoke`, `remote`, `exposed`, `rpcWithWire`, `startWorkflow`, and the agent methods `run`, `stream`, `resume`, `approve` and `interrupt` to `refuseInternal` (`scenario.ts:425-442`). It is the RPC passed to the workflow start call (`scenario.ts:741`).

The core-side rule that an actor step never goes through internal dispatch is in `packages/core/knowledge/decisions/security/workflow-actor-steps-always-use-the-real-transport.md`. This note covers only the CLI guard.

**What this rules out:** running a scenario step through internal dispatch, which skips auth and permissions, and a `workflow.do` inside a scenario that carries no actor.
