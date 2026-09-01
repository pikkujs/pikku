# Pikku AI Vercel (Agent Runner)


## Installation

```bash
yarn add @pikku/ai-vercel ai @ai-sdk/openai  # or any AI SDK provider
```

## API Reference

### `VercelAgentRunner`

```typescript
import { VercelAgentRunner } from '@pikku/ai-vercel'

const runner = new VercelAgentRunner(
  providers: Record<string, any>,                    // provider name → AI SDK provider
  providerFactory?: (apiKey: string) => Record<string, any>,
  allowedAttachmentHosts?: string[]
)
```

**Methods:**

- `stream(params: AgentRunnerParams, channel: AgentStreamChannel): Promise<AgentStepResult>` — Stream AI responses with tool calls
- `run(params: AgentRunnerParams): Promise<AgentStepResult>` — Execute a single AI step (non-streaming)
- `transcribe({ model, audio, … })` / `generateSpeech({ model, text, voice, … })` — what `voiceInput`/`voiceOutput` call; see `references/voice.md`
- `generateImage`, `embed`, `embedMany`, `rerank` — the remaining AI SDK surfaces
- `withApiKey(apiKey)` — returns a **new** runner built from `providerFactory`; returns `this` unchanged when no factory was supplied or the key is blank. This is the per-user-credential path

### Model strings are `provider/model`

Slash, not colon: `'openai/gpt-5-mini'`, `'deepinfra/hexgrad/Kokoro-82M'`,
`'ollama/qwen2.5:7b'`. Only the **first** slash splits, so the model name may
contain its own. A string with no slash at all throws rather than defaulting to
a provider.

### The `'*'` catch-all

`providers['*']` resolves any provider name with no exact entry, and exact
entries win — which makes "everything through the gateway except this one"
expressible as `{ deepinfra: direct, '*': gateway }`. Point it only at something
that genuinely accepts arbitrary model names (a gateway, or a scripted test
provider); aimed at a single vendor, an `anthropic/...` string silently reaching
OpenAI is a bug, not a fallback.

`providers` is public and mutable so deploy-time contributors can swap in
gateway-routed providers after construction.

## Usage Patterns

### Basic Setup

```typescript
import { VercelAgentRunner } from '@pikku/ai-vercel'
import { createOpenAI } from '@ai-sdk/openai'
import { createAnthropic } from '@ai-sdk/anthropic'

const createSingletonServices = pikkuServices(async (config, { secrets }) => {
  const providers: Record<string, any> = {}
  if (await secrets.hasSecret('OPENAI_API_KEY')) {
    providers.openai = createOpenAI({
      apiKey: (await secrets.getSecret('OPENAI_API_KEY')).reveal(),
    })
  }
  return { config, agentRunner: new VercelAgentRunner(providers) }
})
```

The service key is **`agentRunner`** — that is the name the agent wiring looks
up. Registering it as `aiRunner` leaves every agent unable to call a model.

### With an agent

```typescript
import { pikkuAgent } from '#pikku/agent/pikku-agent-types.gen.js'

export const assistant = pikkuAgent({
  name: 'assistant',
  description: 'Answers questions',
  goal: 'You are a helpful assistant.',
  model: 'openai/gpt-5-mini',
})
```

There is no `wireAgent` — agents are declared with `pikkuAgent` from the
generated agent types. See `references/agents.md` for the full config.

### Testing without a real provider

Replacing the _provider_ rather than the runner keeps every code path under test
real — tool loop, streaming, memory, approvals — and only scripts the replies.
Sealing it with `'*'` means no model string, including ones added later, can
reach a live endpoint:

```typescript
new VercelAgentRunner({ '*': createMockLlmProvider() })
```
