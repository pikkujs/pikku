---
type: decision
title: The cloud llm-key command prints the proxy API key to stdout in every format
description: pikku cloud llm-key needs a stored login, then prints the LiteLLM proxy URL and API key as text, env, shell or JSON on stdout
tags: cli, cloud, llm, secrets
---

# The cloud llm-key command prints the proxy API key to stdout in every format

`pikku cloud llm-key` refuses to run without a stored token
(`packages/addon/pikku-cloud-cli/src/functions/llm-key.function.ts:36-41`). It then calls
`getDeveloperLiteLLMKey` and returns the key along with the proxy URL
(`llm-key.function.ts:43-57`).

The renderer writes the key to stdout in each format. The JSON output includes it
(`llm-key.function.ts:69-83`). The env and text output print `OPENAI_API_KEY` and
`LITELLM_API_KEY` lines with the value (`llm-key.function.ts:87-92`, `106`). The shell
output prints the same two variables as `export` lines (`llm-key.function.ts:94-104`).

The command does not mask or write the key to a file. Anything that captures stdout gets the key.

**What this rules out:** treating `--json`, `--env` or `--shell` as a way to show the URL without
the key. Scripts that log stdout will log the key.
