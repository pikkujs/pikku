---
type: decision
title: An agent run is a span and so is each model call
description: A run opens one span through the function-span machinery, its tools and model calls are its children, and only names, ids, token counts and a read cost reach a span
tags: core, agent, observability
---

# An agent run is a span and so is each model call

A run (`runAgent`, `streamAgent`, an approval or a resume, a sub-agent) does not
go through the function runner, so it used to leave no span of its own: its tool
calls were spans, hanging off whatever span called the agent. `inAgentRunSpan`
(`wirings/agent/agent-span.ts`) now opens one span per run with the same
machinery a function uses (`openFunctionSpan`, `runInFunctionSpan`,
`endFunctionSpan`, wire type `agent`, kind `internal`).

The run's trace context is handed down on a **copy** of the caller's
`RunAgentParams`, so `buildToolDefs` captures it and every tool call is a child.
The caller's `params` are never changed: a sub-agent shares them, and the
`anonymousOwnerResourceId` a run mints is forwarded to the caller's object. A
sub-agent run is therefore a child of the run that called it. A resume is a new
run span, named after the stored run's agent, with that run's id; it parents on
the caller's trace, since the trace of the first turn is not stored.

The span is closed in `finally`. A stream turns a failure into an `error` event
and returns, so it reports the failure to the span (`recordAgentRunFailure`)
rather than letting it end `ok`. An interrupt is not a failure (see
[an interrupt is not a failure](an-agent-interrupt-is-not-a-failure.md)): the
run span ends `ok`. A run that suspends for approval ends `ok` too.

## One span per model call

Each step of the loop wraps the call to the `AgentRunnerService` in a `client`
span named `chat`, a child of the run span (`inModelCallSpan`). It sits in core,
around the call, so it covers any runner, not only `@pikku/ai-vercel`. It uses
our own `Tracer`: the AI SDK's `experimental_telemetry` is not enabled and no
OTel SDK is a dependency, because the SDK's spans carry prompts and responses.

Attributes, all on the allow-list
([a span's attributes are an allow-list](a-spans-attributes-are-an-allow-list.md)):
`pikku.agent.name`, `pikku.agent.run_id` (run span); `gen_ai.operation.name`,
`gen_ai.request.model` (only when it is an identifier), `gen_ai.provider.name`
(the part before the `/`), `gen_ai.usage.input_tokens`,
`gen_ai.usage.output_tokens`, `gen_ai.response.finish_reasons` and
`pikku.ai.cost_usd` (model call). `finish_reasons` is an array in OTel; a span
attribute here is a scalar and a step ends once, so it carries the one reason.

A failed model call keeps the error class alone, as a boundary span does: a
provider error can carry a URL or part of a request.

## Cost is read, never estimated

`pikku.ai.cost_usd` is set only when the runner put `cost` on the step result.
`@pikku/ai-vercel` reads it from the `x-litellm-response-cost` response header,
which an LLM proxy such as LiteLLM sets. A provider that says nothing leaves it
off.

**What this rules out:** recording a prompt, a reply, a tool's arguments or its
result on any of these spans; turning on the AI SDK's own telemetry; guessing a
price from a token count.
