---
type: decision
title: An agent's structured output is validated against the schema it declared, not the one the model saw
description: runAgent and resumeAgentSync check the final object against the agent's compiled output schema, after dropping the nulls a strict-mode rewrite invites
tags: agent, schema
---

# An agent's structured output is validated against the schema it declared, not the one the model saw

Until #1823 a `pikkuAgent`'s `output` and a runner's `outputSchema` were a
request to the model and nothing more: the Vercel runner passes the JSON Schema
to the AI SDK without a `validate`, and core returned `result.object` as it
came. `validateAgentOutput` in
`packages/core/src/wirings/agent/agent-output.ts` now runs on a completed run in
both `runAgent` and `resumeAgentSync`, against the JSON Schema codegen compiled
for the agent's output, through the app's `SchemaService` — the same check a
function's input gets, and skipped the same way when no schema service is
configured.

Validation is against the **declared** schema, not the one the runner sent.
`cleanSchema` in `@pikku/ai-vercel` makes every optional property required but
nullable for OpenAI strict mode, so the model answers `null` for "absent";
`dropNullOptionals` removes such a `null` wherever the declared schema neither
requires the field nor allows `null`, and the caller gets the field absent.

A mismatch throws `AgentOutputValidationError` (502 — the bad content came from
the model, not the caller) inside the run's `try`, so it takes the existing
failure path: the run is marked `failed` and `onError` middleware is told. There
is no retry, because no other agent failure retries either.

**What this rules out:** validating against the runner's rewritten schema,
re-asking the model on a mismatch, and failing a `pikkuAgent` run that ended
on text alone — the Vercel runner requests structured output only when the agent
has no tools, so a tool-calling agent with `output` still returns its text. A
streamed run is not validated, and cannot usefully be: its answer reaches the
client as it is generated, before there is a complete object to check, and
`streamAgent` returns the text, so a check at the end could only mark the run
failed after the client had read it. A direct `agentRunner.run` call is not
validated either: it has no agent, so no declared `output` to hold it to.
