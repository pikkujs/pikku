---
type: decision
title: Model resolution stays a single seam even though it is currently a passthrough
description: resolveModelConfig looks removable but is the one merge point for per-request model overrides
tags: agent
---

# Model resolution stays a single seam even though it is currently a passthrough

`resolveModelConfig` in
`packages/core/src/wirings/agent/agent-model-config.ts` returns the
agent's `model`, `temperature` and `maxSteps` unchanged, and ignores its
`_agentName` argument. It reads as dead indirection and is not.

Models are declared per agent in the provider-qualified `provider/model` form
(`openai/gpt-5-mini`); there is no config-level alias map to consult, which is
why the current body is a copy. The function exists so that every caller —
`prepareAgentRun`, both resume paths, and the per-request `input.model` /
`input.temperature` overrides applied in `agent-prepare.ts` — assembles the
effective config the same way, through one place that can grow an alias map,
per-tenant defaults or provider fallbacks without touching them.

**What this rules out:** inlining `agent.model` / `agent.temperature` at the four
call sites and deleting the function, and dropping the unused `_agentName`
parameter from the signature.
