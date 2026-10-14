---
type: decision
title: A skill agent's read-only or writer role is derived from its tool list, not declared
description: The skill agent generator sets acceptanceRole from whether the declared tools include a mutating tool, so the role and the tools cannot disagree
tags: cli, skills, agents, acceptance
---

# A skill agent's read-only or writer role is derived from its tool list, not declared

`packages/cli/src/functions/commands/skill-agents.ts` writes an agent file from a skill's frontmatter.

`MUTATING_TOOLS` lists the tool names that change files (`skill-agents.ts:25-33`). `acceptanceRole`
splits the declared tools on commas and returns `writer` when any is mutating, otherwise
`read-only` (`skill-agents.ts:44-49`). The comment says acceptance is inferred from this role, and
that a read-only role holding a write tool would be judged by rules its tools do not match
(`skill-agents.ts:38-42`).

The tools are the skill's declared list or `DEFAULT_TOOLS` (`skill-agents.ts:100`). The role is
written into the agent file as `acceptanceRole` (`skill-agents.ts:120`).

**What this rules out:** a skill declaring its role separately from its tools.
