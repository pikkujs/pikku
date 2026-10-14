---
type: decision
title: A reachable agent is offered by its registry key, filtered by the persona's scopes
description: reachableAgents offers an agent to a virtual user under the key it is registered with, and only when the persona holds the agent's declared scopes; the server still enforces access
tags: core, virtual-users, agents, scopes
---

# A reachable agent is offered by its registry key, filtered by the persona's scopes

`packages/core/src/wirings/virtual-user/virtual-user-agents.ts` decides which agents
a persona is told about.

An agent with no declared scopes is offered to everybody (`virtual-user-agents.ts:54-55`).
The doc comment says undeclared is not the same as denied (`virtual-user-agents.ts:45-46`).
Otherwise the agent is offered only when the persona's scopes satisfy the agent's
scopes (`virtual-user-agents.ts:57`, `hasScopes`).

The name offered is the registry key, not the agent's display name. The code uses
`name: id` (`virtual-user-agents.ts:59-60`), and the doc comment says the display
name "is frequently something else entirely", and offering it makes the run die
on a 500 (`virtual-user-agents.ts:30-37`).

The doc comment says this filter narrows only what is offered. The server decides
who may talk to which agent (`virtual-user-agents.ts:39-44`).

**What this rules out:** offering an agent name the server cannot resolve, and
treating the offer list as the access check.
