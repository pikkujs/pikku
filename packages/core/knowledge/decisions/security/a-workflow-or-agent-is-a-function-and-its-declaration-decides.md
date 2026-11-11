---
type: decision
title: A workflow or agent is a function, and its own declaration decides who reaches it
description: The generated routes stay dumb, one per action with the session optional; auth unset wants a session, expose true opens the route, and a start runs the function's own checks at the request
tags: workflow, agent, authorization, codegen, scaffold
---

# A workflow or agent is a function, and its own declaration decides who reaches it

The `scaffold.workflow` and `scaffold.agent` routes published every workflow and
agent, because `startWorkflow` checked only that the name existed and the inspector
marked `pikkuWorkflowFunc` sessionless, so an unset `auth` meant open.

A separate set of route gates and anonymous routes fixed that once, and duplicated
what the function pipeline already did. A DSL run calls `runPikkuFunc('workflow', ...)`,
which runs auth, scopes, permissions and validation. So the routes went back to
being dumb, and the decision sits on the declaration:

- `auth` unset wants a session, as on any function. Only `auth: false` is anonymous.
- `/workflow/:name/*` and `/rpc/agent/:name/*` reach only `expose: true` names and
  answer 404 for anything else. The routes do not check it. They call external entry
  points on `rpc`, `rpc.exposedAgent` and `rpc.exposedWorkflow`, which own the gate the
  way `rpc.exposed` owns it for a function. A generated route holds no access logic.
- Nothing checks a workflow on its behalf. `rpc.exposedWorkflow.start` records who is
  calling and starts the run; the workflow's function runs through `runPikkuFunc`,
  which judges `auth`, scopes, permissions and input with the owner's session loaded
  fresh ([[a-run-loads-its-owners-session-every-time-it-executes]]). A refused start
  therefore leaves a failed run and the caller sees the refusal when the run executes,
  or when it reads the run. A graph has no function, so its `auth` is its whole
  declaration and is applied when the run starts; each node runs its own function's
  checks.
- `checkWorkflowRunAccess` is the read and approve routes' own check on the run: the
  run must be the named workflow's, a reader needs a session unless the workflow is
  `auth: false`, a run with an owner is for that owner, an ownerless run is readable
  only on an `auth: false` workflow, and an answer needs a session. It does not run
  the workflow's scopes or permissions.

A route built for agent A must not resume agent B's run. That check lives in
`rpc.exposedAgent` (`resume` and `approve` take the route's `expectedAgentName`), not in
`resumeAgent` or `resumeAgentSync`, which check only the run's owner and the run's own
agent's auth. It runs after the owner check, so only the owner learns a run belongs to
another agent; anyone else gets the ownership refusal.

`/rpc/<workflow>` needed no separate handling: `rpc.exposed` calls `runPikkuFunc`, so
it runs the workflow's declaration. It looked like a bypass only because an unset
`auth` was open, and it went round the old route gates. The call is not a run, and
the body has no `workflow`.

`rpc.startWorkflow` and `rpc.agent` stay unchecked for `expose`. They are the
application's own code, and the internal counterparts of the external entries. Each
entry checks `expose` first, before it reads a run or opens a stream, so a hidden name
answers the same 404 as one that does not exist. `checkWorkflowRunAccess` does not
judge `expose`; the entries do, once per request.

**What this rules out:** workflow-specific auth logic where the pipeline already does
it; a second route for anonymous callers; a global switch for anonymous access;
moving the `expose` check into `startWorkflow`, where it would stop application code;
an `expose` check in generated route code, which a template change could drop.
