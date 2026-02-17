# AI Agent DX Review Prompt

You are an AI Developer Experience specialist who has built production AI agent systems with frameworks like LangChain, CrewAI, Mastra, Vercel AI SDK (directly), OpenAI Agents SDK, and custom implementations. You deeply understand the trade-offs in AI agent framework design: ergonomics vs flexibility, magic vs explicitness, vendor lock-in vs portability, and the real pain points developers face when building, debugging, and operating AI agents in production.

You are reviewing **Pikku**, a TypeScript backend framework that has added AI agent capabilities. Your job is to provide brutally honest, specific feedback from the perspective of a developer evaluating whether to adopt Pikku for AI agent workloads. Focus on what would make you choose or avoid this framework compared to alternatives.

---

## Architecture Overview

Pikku is a backend framework with build-time code inspection (AST analysis) and code generation. The AI agent system is layered:

1. **Service interfaces** (in `@pikku/core`) define abstract contracts for storage, embeddings, vectors, and agent execution
2. **Implementations** (in separate packages like `@pikku/ai-vercel`, `@pikku/pg`) provide concrete backends
3. **Agent definitions** are declarative config objects registered at build time
4. **A core runner** (`ai-agent-runner.ts`) orchestrates memory loading, tool resolution, middleware execution, streaming, and message persistence
5. **Code generation** (CLI) produces typed wrappers, HTTP routes, and metadata from agent definitions
6. **Tools are existing Pikku RPC functions** — any function registered in the framework can be referenced by name as an agent tool

---

## Code to Review

### 1. Agent Definition (Developer-facing API)

This is what a developer writes to define agents:

```typescript
// templates/functions/src/functions/agent.functions.ts

import { pikkuAIAgent } from '../../.pikku/agent/pikku-agent-types.gen.js'
import { AgentOutputSchema } from '../schemas.js'
import { appendModified, logAgentIO } from '../middleware.js'

export const todoAssistant = pikkuAIAgent({
  name: 'todo-assistant',
  description: 'A helpful assistant that manages todos',
  instructions:
    'You help users manage their todo lists. Always respond with a message and optionally include the todos array if relevant.',
  model: 'ollama/qwen2.5:7b',
  tools: ['listTodos', 'createTodo'],
  memory: { storage: 'aiStorage', lastMessages: 10 },
  maxSteps: 5,
  toolChoice: 'auto',
  output: AgentOutputSchema,
  channelMiddleware: [appendModified],
  aiMiddleware: [logAgentIO],
})

export const dailyPlanner = pikkuAIAgent({
  name: 'daily-planner',
  description: 'Plans your day and suggests tasks based on your schedule',
  instructions:
    'You help users plan their day. Given a list of todos or context, suggest a prioritized schedule and recommend additional tasks if needed.',
  model: 'ollama/qwen2.5:7b',
  maxSteps: 3,
})

export const mainRouter = pikkuAIAgent({
  name: 'main-router',
  description: 'Routes requests to specialized agents',
  instructions:
    "You coordinate between agents. First fetch the user's todos, then pass them to the daily planner for scheduling advice.",
  model: 'ollama/qwen2.5:7b',
  agents: ['todo-assistant', 'daily-planner'],
  maxSteps: 5,
})
```

### 2. Agent Type Definition (CoreAIAgent)

```typescript
// packages/core/src/wirings/ai-agent/ai-agent.types.ts

export type CoreAIAgent<
  PikkuPermission = CorePikkuPermission<any, any>,
  PikkuMiddleware = CorePikkuMiddleware<any>,
> = {
  name: string
  description: string
  summary?: string
  errors?: string[]
  instructions: string | string[]
  model: string
  tools?: string[]
  agents?: string[]
  memory?: AIAgentMemoryConfig
  maxSteps?: number
  toolChoice?: 'auto' | 'required' | 'none'
  input?: unknown
  output?: unknown
  tags?: string[]
  middleware?: PikkuMiddleware[]
  channelMiddleware?: CorePikkuChannelMiddleware<any, any>[]
  aiMiddleware?: PikkuAIMiddlewareHooks[]
  permissions?: CorePermissionGroup<PikkuPermission>
}

export type AIAgentMemoryConfig = {
  storage?: string
  vector?: string
  embedder?: string
  lastMessages?: number
  workingMemory?: boolean
  semanticRecall?: { topK?: number } | false
}

export interface AIAgentInput {
  message: string
  threadId: string
  resourceId: string
}

export interface AIAgentOutput {
  runId: string
  text: string
  object?: unknown
  threadId: string
  steps: AIAgentStep[]
  usage: { inputTokens: number; outputTokens: number }
}
```

### 3. AI Middleware Hooks

```typescript
// packages/core/src/wirings/ai-agent/ai-agent.types.ts

export interface PikkuAIMiddlewareHooks<Services = any, Event = any> {
  modifyInput?: (
    services: Services,
    ctx: { messages: AIMessage[]; instructions: string }
  ) =>
    | Promise<{ messages: AIMessage[]; instructions: string }>
    | { messages: AIMessage[]; instructions: string }

  modifyOutputStream?: (
    services: Services,
    ctx: {
      event: Event
      allEvents: readonly Event[]
      state: Record<string, unknown>
    }
  ) => Promise<Event | null> | Event | null

  modifyOutput?: (
    services: Services,
    ctx: {
      text: string
      messages: AIMessage[]
      usage: { inputTokens: number; outputTokens: number }
    }
  ) =>
    | Promise<{ text: string; messages: AIMessage[] }>
    | { text: string; messages: AIMessage[] }
}
```

Example middleware usage:

```typescript
// templates/functions/src/middleware.ts

export const appendModified = pikkuChannelMiddleware<any, AIStreamEvent>(
  async (_services, event, next) => {
    if (event.type === 'text-delta') {
      await next({ ...event, text: event.text + ' - modified' })
    } else {
      await next(event)
    }
  }
)

export const logAgentIO = pikkuAIMiddleware({
  modifyInput: async ({ logger }, { messages, instructions }) => {
    logger.info(`Agent input: ${messages.length} messages`)
    return { messages, instructions }
  },
  modifyOutputStream: async (_services, { event, state }) => {
    if (event.type === 'text-delta') {
      state.charCount = ((state.charCount as number) ?? 0) + event.text.length
    }
    return event
  },
})
```

### 4. Service Interfaces

```typescript
// packages/core/src/services/ai-agent-runner-service.ts

export type AIAgentRunnerParams = {
  model: string
  instructions: string
  messages: AIMessage[]
  tools: AIAgentToolDef[]
  maxSteps: number
  toolChoice: 'auto' | 'required' | 'none'
  outputSchema?: Record<string, unknown>
}

export interface AIAgentRunnerService {
  stream(params: AIAgentRunnerParams, channel: AIStreamChannel): Promise<void>
  run(params: AIAgentRunnerParams): Promise<AIAgentRunnerResult>
}

// packages/core/src/services/ai-storage-service.ts

export interface AIStorageService {
  createThread(
    resourceId: string,
    options?: {
      threadId?: string
      title?: string
      metadata?: Record<string, unknown>
    }
  ): Promise<AIThread>
  getThread(threadId: string): Promise<AIThread>
  getThreads(resourceId: string): Promise<AIThread[]>
  deleteThread(threadId: string): Promise<void>
  getMessages(
    threadId: string,
    options?: { lastN?: number; cursor?: string }
  ): Promise<AIMessage[]>
  saveMessages(threadId: string, messages: AIMessage[]): Promise<void>
  getWorkingMemory(
    id: string,
    scope: 'resource' | 'thread'
  ): Promise<Record<string, unknown> | null>
  saveWorkingMemory(
    id: string,
    scope: 'resource' | 'thread',
    data: Record<string, unknown>
  ): Promise<void>
}

// packages/core/src/services/ai-run-state-service.ts

export interface AIRunStateService {
  createRun(run: CreateRunInput): Promise<string>
  updateRun(runId: string, updates: Partial<AgentRunState>): Promise<void>
  getRun(runId: string): Promise<AgentRunState | null>
  getRunsByThread(threadId: string): Promise<AgentRunState[]>
}

// packages/core/src/services/ai-vector-service.ts

export interface AIVectorService {
  upsert(
    entries: {
      id: string
      vector: number[]
      metadata?: Record<string, unknown>
    }[]
  ): Promise<void>
  search(
    vector: number[],
    options?: { topK?: number; filter?: Record<string, unknown> }
  ): Promise<
    { id: string; score: number; metadata?: Record<string, unknown> }[]
  >
  delete(ids: string[]): Promise<void>
}

// packages/core/src/services/ai-embedder-service.ts

export interface AIEmbedderService {
  embed(texts: string[]): Promise<number[][]>
}
```

### 5. Vercel AI SDK Runner Implementation

```typescript
// packages/services/ai-vercel/src/vercel-ai-agent-runner.ts

export class VercelAIAgentRunner implements AIAgentRunnerService {
  private providers: Record<string, any>

  constructor(providers: Record<string, any>) {
    this.providers = providers
  }

  private parseModel(model: string): { provider: string; modelName: string } {
    const slashIndex = model.indexOf('/')
    if (slashIndex === -1) {
      throw new Error(
        `Invalid model format '${model}'. Expected 'provider/model' (e.g. 'openai/gpt-4o', 'ollama/qwen2.5:7b').`
      )
    }
    return {
      provider: model.slice(0, slashIndex),
      modelName: model.slice(slashIndex + 1),
    }
  }

  private buildTools(params: AIAgentRunnerParams) {
    return Object.fromEntries(
      params.tools.map((t) => [
        t.name,
        aiTool({
          description: t.description,
          parameters: jsonSchema(t.inputSchema as any),
          execute: async (input: any) => t.execute(input),
        }),
      ])
    )
  }

  async stream(
    params: AIAgentRunnerParams,
    channel: AIStreamChannel
  ): Promise<void> {
    const { provider: providerName, modelName } = this.parseModel(params.model)
    const provider = this.getProvider(providerName)
    const sdkModel = provider(modelName)
    const aiTools = this.buildTools(params)
    const messages = convertToSDKMessages(params.messages)

    const result = streamText({
      model: sdkModel,
      system: params.instructions,
      messages,
      tools: aiTools,
      maxSteps: params.maxSteps,
      toolChoice: params.toolChoice,
      ...(params.outputSchema
        ? {
            output: Output.object({
              schema: jsonSchema(params.outputSchema as any),
            }),
          }
        : {}),
    })

    try {
      for await (const part of result.fullStream) {
        switch (part.type) {
          case 'text-delta':
            channel.send({ type: 'text-delta', text: part.textDelta })
            break
          case 'reasoning':
            channel.send({ type: 'reasoning-delta', text: part.textDelta })
            break
          case 'tool-call':
            channel.send({
              type: 'tool-call',
              toolName: part.toolName,
              args: part.args,
            })
            break
          case 'tool-result':
            channel.send({
              type: 'tool-result',
              toolName: part.toolName,
              result: part.result,
            })
            break
          case 'step-finish':
            channel.send({
              type: 'usage',
              tokens: {
                input: part.usage.promptTokens,
                output: part.usage.completionTokens,
              },
              model: modelName,
            })
            break
          case 'error':
            channel.send({
              type: 'error',
              message:
                part.error instanceof Error
                  ? part.error.message
                  : String(part.error),
            })
            break
        }
      }
    } catch (err) {
      channel.send({
        type: 'error',
        message: err instanceof Error ? err.message : String(err),
      })
    } finally {
      channel.send({ type: 'done' })
    }
  }

  async run(params: AIAgentRunnerParams): Promise<AIAgentRunnerResult> {
    // ... similar to stream but using generateText() ...
  }
}
```

### 6. Core Agent Runner (Orchestration)

```typescript
// packages/core/src/wirings/ai-agent/ai-agent-runner.ts

// Key function: prepareAgentRun
// - Resolves agent by name (supports namespaced agents like 'pkg:agent-name')
// - Loads thread history from storage
// - Loads context (working memory, semantic recall via embeddings)
// - Builds tool definitions from registered RPC functions
// - Builds sub-agent tools (agents-as-tools pattern)
// - Trims messages to token budget

// streamAIAgent():
// 1. Calls prepareAgentRun() to set up context
// 2. Runs AI middleware (modifyInput hooks)
// 3. Creates a run in AIRunStateService
// 4. Saves user message
// 5. Wraps channel with channel middleware + AI stream middleware
// 6. Creates a persisting channel that auto-saves messages to storage
// 7. Calls agentRunner.stream() with the wrapped channel
// 8. Runs AI middleware (modifyOutput hooks)
// 9. Updates working memory and semantic embeddings
// 10. Updates run state to completed

// runAIAgent():
// Same as stream but synchronous — calls agentRunner.run(), saves messages after

// Sub-agent orchestration:
// - Parent agents can list sub-agents by name in `agents: ['todo-assistant', 'daily-planner']`
// - Sub-agents become tools with { message, session } input
// - Session-based thread continuity: same session name reuses the same thread
// - In streaming mode, sub-agents get scoped channels that tag events with agent/session

// Tool approval flow:
// - Tools can require approval (configurable per-agent)
// - ToolApprovalRequired error suspends the run
// - approveAIAgent() resumes or keeps suspended
// - Approval state persisted via AIRunStateService
```

### 7. Server Bootstrap (How services are wired)

```typescript
// templates/ai-postgres/src/start.ts

const sql = postgres(process.env.POSTGRES_URL || 'postgres://...')
const pgAiStorage = new PgAIStorageService(sql)
await pgAiStorage.init()

const secrets = new LocalSecretService()

const providers: Record<string, any> = {
  ollama: createOpenAI({
    baseURL: 'http://localhost:11434/v1',
    apiKey: 'ollama',
  }),
}

if (await secrets.hasSecret('OPENAI_API_KEY')) {
  providers.openai = createOpenAI({
    apiKey: await secrets.getSecret('OPENAI_API_KEY'),
  })
}
if (await secrets.hasSecret('ANTHROPIC_API_KEY')) {
  providers.anthropic = createAnthropic({
    apiKey: await secrets.getSecret('ANTHROPIC_API_KEY'),
  })
}

const singletonServices = await createSingletonServices(config, {
  aiStorage: pgAiStorage,
  aiRunState: pgAiStorage,
  aiAgentRunner: new VercelAIAgentRunner(providers),
})
```

### 8. SSE Stream Event Types

```typescript
export type AIStreamEvent =
  | { type: 'text-delta'; text: string; agent?: string; session?: string }
  | { type: 'reasoning-delta'; text: string; agent?: string; session?: string }
  | {
      type: 'tool-call'
      toolName: string
      args: unknown
      agent?: string
      session?: string
    }
  | {
      type: 'tool-result'
      toolName: string
      result: unknown
      agent?: string
      session?: string
    }
  | { type: 'agent-call'; agentName: string; session: string; input: unknown }
  | {
      type: 'agent-result'
      agentName: string
      session: string
      result: unknown
    }
  | {
      type: 'approval-request'
      id: string
      toolName: string
      args: unknown
      agent?: string
      session?: string
    }
  | {
      type: 'usage'
      tokens: { input: number; output: number }
      model: string
      agent?: string
      session?: string
    }
  | { type: 'error'; message: string; agent?: string; session?: string }
  | { type: 'done' }
```

### 9. PostgreSQL Storage Implementation

```typescript
// packages/services/pg/src/pg-ai-storage-service.ts

// PgAIStorageService implements both AIStorageService and AIRunStateService
// Auto-creates schema with tables:
//   - ai_threads (id, resource_id, title, metadata)
//   - ai_messages (id, thread_id, role, content, tool_calls, tool_results)
//   - ai_working_memory (id, scope, data)
//   - ai_run (run_id, agent_name, thread_id, resource_id, status, usage)
//   - ai_run_approval (tool_call_id, run_id, tool_name, args, status)
```

### 10. Auto-generated HTTP Routes

The CLI generates public HTTP endpoints for agents:

```
POST /rpc/agent/:agentName          → sync run (returns JSON)
POST /rpc/agent/:agentName/stream   → SSE stream
POST /rpc/agent/:agentName/approve  → approve/reject tool calls
OPTIONS /rpc/agent/:agentName       → CORS preflight
OPTIONS /rpc/agent/:agentName/stream → CORS preflight
```

---

## Review Questions

Please evaluate each area with specific, actionable feedback:

1. **Agent Definition DX**: How does the declarative `pikkuAIAgent({...})` API compare to alternatives? What's missing, what's unnecessary, what would you change?

2. **Tools-as-RPC**: Tools are existing typed RPC functions referenced by string name. Compare this to inline tool definitions (like Vercel AI SDK) or decorator-based tools (like LangChain). What are the DX trade-offs?

3. **Memory System**: Working memory, semantic recall, message history — is this the right abstraction? How does it compare to Mastra's memory or LangGraph's state?

4. **Multi-Agent Orchestration**: Agents-as-tools with session-based thread continuity. Compare to CrewAI's crew patterns, LangGraph's graph-based orchestration, or OpenAI Swarm's handoff model.

5. **Middleware Architecture**: Three layers (HTTP middleware, channel middleware, AI middleware hooks). Is this too complex? Too simple? How would you improve the hook points?

6. **Streaming**: SSE with typed event discriminated union, scoped channels for sub-agents, persisting channel wrapper. What works, what doesn't?

7. **Service Abstraction**: The 5 AI service interfaces (runner, storage, vector, embedder, run state). Are these the right boundaries? Too granular? Missing anything?

8. **Provider Portability**: `model: 'ollama/qwen2.5:7b'` with pluggable providers at the runner level. How does this compare to Vercel AI SDK's provider registry or LiteLLM?

9. **Code Generation**: Types, routes, and metadata are generated at build time from AST analysis. What's the DX impact vs runtime registration?

10. **Overall Assessment**: Would you use Pikku for AI agents? What's the strongest selling point? What's the biggest gap? Who is the ideal user?

Be specific. Reference the code. Compare to real alternatives with concrete examples of what they do better or worse.
