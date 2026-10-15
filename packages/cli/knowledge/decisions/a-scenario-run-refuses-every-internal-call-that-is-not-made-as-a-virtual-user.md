---
type: decision
title: A scenario run refuses every internal RPC, workflow start and agent call that is not made as a virtual user
description: The CLI scenario runner passes a guard RPC that throws on invoke, remote, exposed, rpcWithWire, startWorkflow and the agent methods, so app calls in a scenario go out as a virtual user over HTTP
tags: cli, scenarios, workflow, virtual-users
---

# A scenario run refuses every internal RPC, workflow start and agent call that is not made as a virtual user

The scenario runner runs steps in the CLI process. Its comment in
`packages/cli/src/functions/commands/scenario.ts` says everything a step touches in the app goes over
HTTP through a virtual user, and that `guardRpc` is what enforces this.

`refuseInternal` throws for any name. The message says a scenario tried to run an internal step, and
that each `workflow.do` must carry `{ virtualUser: virtualUsers.x }` so it executes against the
environment rather than local services.

`guardRpc` sends `invoke`, `remote`, `exposed`, `rpcWithWire`, `startWorkflow`, and the agent methods
`run`, `stream`, `resume`, `approve` and `interrupt` to `refuseInternal`. It is the RPC passed to the
workflow start call.

The core-side rule that a virtual user step never goes through internal dispatch is in
[workflow virtual user steps always use the real transport](../../../core/knowledge/decisions/security/workflow-virtual-user-steps-always-use-the-real-transport.md).
This note covers only the CLI guard.

**What this rules out:** running a scenario step through internal dispatch, which skips auth and
permissions, and a `workflow.do` inside a scenario that carries no virtual user.
