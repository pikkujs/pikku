---
type: decision
title: Workflow and agent routes require a session and an opt-in
description: The generated routes want a session and reach only expose true workflows and agents; anonymous callers have separate routes that need an explicit auth false; rpc.startWorkflow and rpc.agent stay open to application code
tags: workflow, agent, authorization, codegen, scaffold
---

# Workflow and agent routes require a session and an opt-in

The `scaffold.workflow` and `scaffold.agent` routes were generated `auth: false`,
on the reasoning that a dispatcher forwards to something that answers for itself.
Neither target did. `startWorkflow` checked only that the name existed, and an
agent's `auth` defaults to false. Enabling the scaffold published every workflow
and agent to anonymous callers, including internal ones.

Now the opt-in sits on the workflow or agent:

- `pikkuFunc` with `auth: true` on `/workflow/:name/{start,run,status,approve}` and
  `/rpc/agent/:name/{,stream,approve,resume}`. A name that is not `expose: true`
  answers 404, the same as an unknown name.
- `/workflow/:name/start/anonymous` and `/rpc/agent/:name/anonymous{,/stream}` are
  the only sessionless routes. They need `expose: true` and an explicit
  `auth: false`, and answer 401 for every other name.
- The start routes validate against the workflow's declared input schema.

The gates are `prepareWorkflowRouteStart`, `assertWorkflowRunAnswerable`
and `assertWorkflowRunReadable` in `workflow-run-ownership.ts`, and
`assertAgentRouteAccess` in `agent-prepare.ts`. A route calls them; the runtime
below does not. `rpc.startWorkflow` and `rpc.agent` are for the application's own
code, which has already decided who may call it.

Anonymous has no status or approve route. A run started anonymously has no owner,
so nobody can read it, and an approval needs someone to be judged.

`expose: true` on a workflow means these routes only. The inspector no longer
publishes the workflow's function as an RPC, because `/rpc/<name>` would then
reach the body with no session and no route gate.

**What this rules out:** a global switch for anonymous access; a route that gates
only on the name in its URL when the run says otherwise; moving these checks into
`startWorkflow` or `approveStep`, where they would stop application code.
