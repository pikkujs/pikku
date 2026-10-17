---
'@pikku/core': patch
'@pikku/skills': patch
---

An agent's structured output is now validated (#1823).

**Breaking:** a `pikkuAgent` with an `output` schema fails its run with the new `AgentOutputValidationError` (502; `issues` lists what did not match) when the model's object does not match, instead of returning the malformed object. This applies to `rpc.agent.run`, `rpc.agent.approve` and sub-agent calls, and uses the app's `SchemaService`, like function input validation. The run is marked `failed` and `onError` agent middleware runs, as for any other agent failure; nothing is retried. A `null` the model sends for an optional field — which `@pikku/ai-vercel` invites by making optional properties nullable for OpenAI strict mode — is now dropped, so the field comes back absent rather than `null`.

`runAgentStructured(agentRunner, params)` from `@pikku/core/agent` is the typed way to call a runner directly. It takes a Standard Schema that also converts to JSON Schema (a zod 4 schema is one), sends the JSON Schema to the model, validates the answer against the original schema, and returns `object` typed as the schema's output:

```ts
const { object } = await runAgentStructured(agentRunner, {
  model: 'openai/gpt-5-mini',
  instructions: 'Review the screenshot.',
  messages,
  tools: [],
  maxSteps: 1,
  toolChoice: 'none',
  outputSchema: z.object({ score: z.number(), notes: z.string().optional() }),
})
```

`AgentStepResult` takes an optional type parameter for its `object`, defaulting to `unknown`.
