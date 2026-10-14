---
type: decision
title: The services map requires agentRunService whenever the agent scaffold is on and the project has agents
description: The generated public-agent permission destructures agentRunService after the inspector has run, so pikku services adds it to the required singletons by hand
tags: cli, codegen, services, agents
---

# The services map requires agentRunService whenever the agent scaffold is on and the project has agents

`serializeServicesMap` in `packages/cli/src/functions/wirings/functions/pikku-command-services.ts`
takes an `agentScaffoldEnabled` flag (line 18). When it is true, the function adds
`agentRunService` to the used services (lines 67-68).

The comment gives the reason (lines 61-66). The generated public-agent permission
`isThreadOwner` always destructures `agentRunService`, but `agent.gen.ts` is written after
`requiredServices` is computed from the hand-written sources, so the inspector never sees that
usage. The generated file does destructure it (`packages/cli/src/functions/wirings/agent/serialize-public-agent.ts:87-89`).

The caller computes the flag as `config.scaffold?.agent` and at least one entry in
`visitState.agents?.agentsMeta` (`pikku-command-services.ts:186-189`). The comment adds that the
scaffold being configured is a project-wide fact and says nothing about a single deployment unit
(lines 63-66), which is why agents are counted as well as the config.

In the same function, `analytics` and `auditLog` are removed from the used set because the runner
installs them (lines 71-74), so destructuring them does not make them required of
`createSingletonServices`.

**What this rules out:** leaving `agentRunService` optional on a project that serves the generated
agent routes, and turning the requirement on from the scaffold config alone for a project with no agents.
