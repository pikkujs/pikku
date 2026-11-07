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
  answer 404 for anything else. That check has to be at the route, because the route
  calls `rpc.startWorkflow`, which makes an outside call look internal.
- `checkWorkflowStart` runs the pipeline up to the body with the caller's session,
  through the `gate` option of `runPikkuFunc`, so a refused start leaves no run. A
  graph has no function, so its `auth` is its whole declaration, and each node still
  runs its own function's checks.
- `checkWorkflowRunAccess` covers status, streams and approve, which never call the
  function. It looks the workflow up by name, confirms the run belongs to it and
  applies the same declaration, passing the run's stored input to permissions.

`/rpc/<workflow>` needed no separate handling: `rpc.exposed` calls `runPikkuFunc`, so
it runs the workflow's declaration. It looked like a bypass only because an unset
`auth` was open, and it went round the old route gates. The call is not a run, and
the body has no `workflow`.

`rpc.startWorkflow` and `rpc.agent` stay unchecked for `expose`. They are the
application's own code.

**What this rules out:** workflow-specific auth logic where the pipeline already does
it; a second route for anonymous callers; a global switch for anonymous access;
moving the `expose` check into `startWorkflow`, where it would stop application code.
