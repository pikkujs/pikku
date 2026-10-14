---
type: decision
title: The fabric llm-key command prints the proxy API key to stdout in every format
description: fabric llm-key needs a stored login, then prints the LiteLLM proxy URL and API key as text, env, shell or JSON on stdout
tags: cli, fabric, llm, secrets
---

# The fabric llm-key command prints the proxy API key to stdout in every format

`pikku fabric llm-key` refuses to run without a stored token
(`packages/cli/src/fabric/functions/llm-key.function.ts:35-40`). It then calls
`getDeveloperLiteLLMKey` and returns the key along with the proxy URL
(`llm-key.function.ts:42-56`).

The renderer writes the key to stdout in each format. The JSON output includes it
(`llm-key.function.ts:68-82`). The env and text output print `OPENAI_API_KEY` and
`LITELLM_API_KEY` lines with the value (`llm-key.function.ts:86-91`, `105`). The shell
output prints the same two variables as `export` lines (`llm-key.function.ts:93-103`).

The command does not mask or write the key to a file. Anything that captures stdout gets the key.

**What this rules out:** treating `--json`, `--env` or `--shell` as a way to show the URL without
the key. Scripts that log stdout will log the key.
