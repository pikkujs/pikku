---
type: decision
title: The inspector records an agent's permissions only to aggregate the services they need, never to check access
description: addAgent adds the agent's permission names to usedPermissions, and post-process reads that set only to collect each permission's services
tags: inspector, agents, permissions
---

# The inspector records an agent's permissions only to aggregate the services they need, never to check access

`addAgent` resolves the agent's permissions and adds their names to `state.serviceAggregation.usedPermissions` (`packages/inspector/src/add/add-agent.ts:612`, `:618-620`). `post-process.ts` reads the same set at `packages/inspector/src/utils/post-process.ts:160`, and at `:206-209` it adds each used permission's `services` to the service list.

Within the inspector source those are the only readers. `serialize-inspector-state.ts` copies the set in and out (`packages/inspector/src/utils/serialize-inspector-state.ts:294`, `:522`, `:746`). Nothing in the inspector compares a caller against the set.

**What this rules out:** reading the inspector's agent permission list as evidence that an agent is guarded, and adding an access decision to the inspector's aggregation step.
