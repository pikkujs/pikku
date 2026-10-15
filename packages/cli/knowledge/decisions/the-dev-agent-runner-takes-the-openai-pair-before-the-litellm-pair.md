---
type: decision
title: The dev agent runner takes the complete OpenAI pair before the LiteLLM pair
description: createDevAgentRunner pairs each base URL with its own key, prefers a complete OPENAI_BASE_URL and OPENAI_API_KEY pair, falls back to the LITELLM pair, and leaves agents disabled when neither is complete
tags: cli, dev-server, agents, llm
---

# The dev agent runner takes the complete OpenAI pair before the LiteLLM pair

`createDevAgentRunner` in `packages/cli/src/functions/commands/dev-agent-runner.ts`
reads four variables: `OPENAI_BASE_URL`, `OPENAI_API_KEY`, `LITELLM_PROXY_URL` and
`LITELLM_API_KEY` (`dev-agent-runner.ts:46-49`).

The comment gives the reason. A URL taken from one pair and a key from the other
would "misroute or 401 every call", so the code pairs them: "Take a complete OpenAI
pair first, else LiteLLM" (`dev-agent-runner.ts:43-45`). The selection is at
`dev-agent-runner.ts:51-56`. An OpenAI pair is used only when both its URL and key
are set, otherwise a complete LiteLLM pair, otherwise neither.

If neither pair is complete, the function logs at debug level and returns
`undefined`, so agents stay disabled (`dev-agent-runner.ts:58-63`).

**What this rules out:** a half-set `OPENAI_*` pair overriding a complete LiteLLM
pair, and a base URL combined with a key from the other pair.
