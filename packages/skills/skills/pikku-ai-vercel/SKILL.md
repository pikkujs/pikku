---
name: pikku-ai-vercel
description: >-
  Use when setting up AI agent execution with the Vercel AI SDK in a Pikku app. Covers
  VercelAIAgentRunner for streaming and non-streaming AI agent steps. TRIGGER when: code uses
  VercelAIAgentRunner, user asks about Vercel AI SDK integration, AI agent runners, or
  @pikku/ai-vercel. DO NOT TRIGGER when: user asks about AI agent wiring (use pikku-ai-agent) or
  voice I/O (use pikku-ai-voice).
installGroups: [core]
---

# Pikku AI Vercel (Agent Runner)

## Agent Operating Procedure

Use this skill as an execution checklist, not reference material.

1. Discover before editing. Run the relevant `pikku meta ... --json` command and inspect only the focused output you need.
2. Identify the source files that own the behavior. Do not start by reading generated output, `.pikku`, `node_modules`, vendored packages, or broad build artifacts.
3. Make the smallest source change that satisfies the task. Keep generated files generated, and avoid hand-editing SDKs, schema output, or typegen.
4. Validate with the narrowest relevant command first, then run `pikku-verify` or `pikku all` when functions, wirings, schemas, or generated clients may have changed.
5. If validation fails, fix the source cause and rerun validation. Do not paper over generated errors by editing generated files.

`@pikku/ai-vercel` provides an AI agent runner backed by the [Vercel AI SDK](https://sdk.vercel.ai/). Implements `AIAgentRunnerService` from `@pikku/core`.

## Installation

```bash
yarn add @pikku/ai-vercel ai @ai-sdk/openai  # or any AI SDK provider
```

## API Reference

### `VercelAIAgentRunner`

```typescript
import { VercelAIAgentRunner } from '@pikku/ai-vercel'

const runner = new VercelAIAgentRunner(
  providers: Record<string, any>,                    // provider name → AI SDK provider
  providerFactory?: (apiKey: string) => Record<string, any>,
  allowedAttachmentHosts?: string[]
)
```

**Methods:**

- `stream(params: AIAgentRunnerParams, channel: AIStreamChannel): Promise<AIAgentStepResult>` — Stream AI responses with tool calls
- `run(params: AIAgentRunnerParams): Promise<AIAgentStepResult>` — Execute a single AI step (non-streaming)
- `transcribe({ model, audio, … })` / `generateSpeech({ model, text, voice, … })` — what `voiceInput`/`voiceOutput` call; see `pikku-ai-voice`
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
import { VercelAIAgentRunner } from '@pikku/ai-vercel'
import { createOpenAI } from '@ai-sdk/openai'
import { createAnthropic } from '@ai-sdk/anthropic'

const createSingletonServices = pikkuServices(async (config, { secrets }) => {
  const providers: Record<string, any> = {}
  if (await secrets.hasSecret('OPENAI_API_KEY')) {
    providers.openai = createOpenAI({
      apiKey: (await secrets.getSecret('OPENAI_API_KEY')).reveal(),
    })
  }
  return { config, aiAgentRunner: new VercelAIAgentRunner(providers) }
})
```

The service key is **`aiAgentRunner`** — that is the name the agent wiring looks
up. Registering it as `aiRunner` leaves every agent unable to call a model.

### With an agent

```typescript
import { pikkuAIAgent } from '#pikku/agent/pikku-agent-types.gen.js'

export const assistant = pikkuAIAgent({
  name: 'assistant',
  description: 'Answers questions',
  goal: 'You are a helpful assistant.',
  model: 'openai/gpt-5-mini',
})
```

There is no `wireAIAgent` — agents are declared with `pikkuAIAgent` from the
generated agent types. See `pikku-ai-agent` for the full config.

### Testing without a real provider

Replacing the *provider* rather than the runner keeps every code path under test
real — tool loop, streaming, memory, approvals — and only scripts the replies.
Sealing it with `'*'` means no model string, including ones added later, can
reach a live endpoint:

```typescript
new VercelAIAgentRunner({ '*': createMockLlmProvider() })
```
