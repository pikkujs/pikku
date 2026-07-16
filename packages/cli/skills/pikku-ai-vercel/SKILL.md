---
name: pikku-ai-vercel
description: >-
  Use when setting up AI agent execution with the Vercel AI SDK in a Pikku app. Covers
  VercelAIAgentRunner for streaming and non-streaming AI agent steps. TRIGGER when: code uses
  VercelAIAgentRunner, user asks about Vercel AI SDK integration, AI agent runners, or
  @pikku/ai-vercel. DO NOT TRIGGER when: user asks about AI agent wiring (use pikku-ai-agent) or
  voice I/O (use pikku-ai-voice).
---

# Pikku AI Vercel (Agent Runner)

## Agent Operating Procedure

Use this skill as an execution checklist, not reference material.

1. Discover before editing. Prefer OpenCode tools such as `pikku-meta` when available; otherwise run the relevant `pikku meta ... --json` command and inspect only the focused output you need.
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
  providers: Record<string, any>  // Map of provider name → Vercel AI SDK provider instance
)
```

**Methods:**

- `stream(params: AIAgentRunnerParams, channel: AIStreamChannel): Promise<AIAgentStepResult>` — Stream AI responses with tool calls
- `run(params: AIAgentRunnerParams): Promise<AIAgentStepResult>` — Execute a single AI step (non-streaming)

The `providers` map lets you register multiple AI providers. Model strings use `provider:model` format (e.g., `"openai:gpt-4o"`).

## Usage Patterns

### Basic Setup

```typescript
import { VercelAIAgentRunner } from '@pikku/ai-vercel'
import { openai } from '@ai-sdk/openai'
import { anthropic } from '@ai-sdk/anthropic'

const createSingletonServices = pikkuServices(async (config) => {
  const aiRunner = new VercelAIAgentRunner({
    openai: openai,
    anthropic: anthropic,
  })
  return { config, aiRunner }
})
```

### With AI Agent Wiring

```typescript
import { wireAIAgent } from '@pikku/core/ai-agent'

wireAIAgent({
  name: 'assistant',
  model: 'openai:gpt-4o',
  systemPrompt: 'You are a helpful assistant.',
  func: myAgentFunc,
})
```

The `VercelAIAgentRunner` is used internally by Pikku's AI agent wiring to execute model calls. See `pikku-ai-agent` for wiring details.
