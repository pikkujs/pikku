---
name: pikku-agent
description: >-
  Use when building AI agents, chatbots, or LLM-powered assistants with Pikku. Covers
  pikkuAgent, ref() tool registration, memory, streaming, tool approval, thread ownership, and
  invocation via rpc.agent. TRIGGER when: code uses pikkuAgent/rpc.agent/runAgent/
  streamAgent, user asks about AI agents, chatbots, LLM assistants, tool-calling agents, agent
  memory/streaming, or `pikku enable agent`. DO NOT TRIGGER when: user asks about MCP tool
  exposure (use pikku-mcp) or general function definitions (use pikku-concepts).
installGroups: [core]
---

# Pikku AI Agent Wiring

## Agent Operating Procedure

Use this skill as an execution checklist, not reference material.

1. Discover before editing. Run the relevant `pikku meta ... --json` command and inspect only the focused output you need.
2. Identify the source files that own the behavior. Do not start by reading generated output, `.pikku`, `node_modules`, vendored packages, or broad build artifacts.
3. Make the smallest source change that satisfies the task. Keep generated files generated, and avoid hand-editing SDKs, schema output, or typegen.
4. Validate with the narrowest relevant command first, then run `pikku-verify` or `pikku all` when functions, wirings, schemas, or generated clients may have changed.
5. If validation fails, fix the source cause and rerun validation. Do not paper over generated errors by editing generated files.

Build AI agents that use Pikku functions as tools. Agents support conversation memory, streaming, and multi-step tool execution.

## Before You Start

```bash
pikku info functions --verbose   # See existing functions that can be used as agent tools
pikku info tags --verbose        # Understand project organization
```

See `pikku-concepts` for the core mental model.

## API Reference

### `pikkuAgent(config)`

Import it from the generated agent types file — `#pikku` does not re-export it:

```typescript
import { pikkuAgent } from '#pikku/agent/pikku-agent-types.gen.js'
import { ref } from '#pikku/function'

pikkuAgent({
  name: string,                  // Unique agent identifier
  description: string,           // What the agent does (shown in agent listings)
  summary?: string,
  errors?: string[],

  // --- system prompt: three fields, joined role → personality → goal ---
  role?: string,                 // Who it is: 'You are a support engineer triaging bugs.'
  personality?: string,          // How it sounds: tone, verbosity
  goal: string,                  // REQUIRED — what it is for

  model: string,                 // e.g. 'openai/gpt-5-mini'
  temperature?: number,
  providerOptions?: {            // passed through untouched, keyed by provider
    openai?: { reasoningEffort?: 'minimal' | ... },
  },

  // --- capabilities: all three take ref() handles, not imported values ---
  tools?: unknown[],             // ref('todos:addTodo'), ref('graph:sleep'), …
  agents?: unknown[],            // sub-agents to delegate to
  workflows?: unknown[],         // workflows callable as a tool
  agentMode?: 'delegate' | 'supervise',

  memory?: {
    storage?: string,            // Service name for persistence (e.g. 'agentStorage')
    vector?: string,             // Vector store service name
    embedder?: string,           // Embedding service name
    lastMessages?: number,       // How many messages to retain in context
    workingMemory?: ZodSchema,   // Schema for structured working memory
  },

  maxSteps?: number,             // Max tool-call rounds per invocation
  toolChoice?: 'auto' | 'required' | 'none',
  prepareStep?: (ctx) => void,   // See "Narrowing tools per step"
  input?: ZodSchema,
  output?: ZodSchema,            // Structured output — only honoured with NO tools
  tags?: string[],

  sessionScope?: 'user' | 'org', // Who owns this agent's threads. Default 'user'
  auth?: boolean,                // Default false — see below
  scopes?: ScopeId[],            // AND gate, checked before permissions
  permissions?: PermissionGroup,

  middleware?: PikkuMiddleware[],
  channelMiddleware?: PikkuChannelMiddleware[],
  agentMiddleware?: PikkuAgentMiddlewareHooks[],
})
```

**`goal` is the required prompt field, not `instructions`** — there is no
`instructions` key. `role`/`personality`/`goal` are concatenated in that order,
and nothing validates which text lands in which, so the split is purely for
legibility: prose in the "wrong" one still reaches the model.

**Tools are `ref('domain:funcName')` handles, not imported function values.** The
inspector resolves the ref against the generated function map, which is what lets
an agent reach a function in another package (or a `graph:*` builtin) without an
import cycle.

`auth` defaults to `false` because agents are usually invoked from an
already-authenticated `pikkuFunc`. `scopes` and `permissions` are enforced either
way — see `pikku-permissions`.

### Invoking an agent

From inside a Pikku function, go through `wire.rpc.agent` — it carries the
session, credentials, and RPC depth for you:

```typescript
const result = await rpc.agent.run('todo-agent', {
  message, threadId, resourceId,     // required
  attachments?, model?, temperature?, context?,
})

await rpc.agent.stream('todo-agent', input)              // writes to the wire's channel
await rpc.agent.approve(runId, [{ toolCallId, approved }], expectedAgentName?)
await rpc.agent.resume(runId, { toolCallId, approved })
await rpc.agent.interrupt(runId, 'user' | 'speech' | 'timeout')
```

`context` is a string injected into the system prompt for this request only —
use it for upfront state (current org, project, deployment) so the agent stops
asking the user for identifiers it could have been handed.

`run` resolves to:

```typescript
{
  runId, threadId, text,
  object?,                              // set when the agent has an `output` schema
  steps,                                // tool calls made
  usage: { inputTokens, outputTokens },
  status?: 'completed' | 'suspended',
  pendingApprovals?: [{ toolCallId, toolName, args, reason?, runId }],
}
```

`runAgent` / `streamAgent` from `@pikku/core/agent` are the layer beneath
this. Their third argument is `RunAgentParams` (`{ sessionService?,
getCredential?, anonymousOwnerResourceId? }`) — **not** `{ singletonServices }`.
Reach for them only outside a wired function; inside one, `rpc.agent` is the
supported path.

### Stream events

`rpc.agent.stream` pushes `AgentStreamEvent`s onto the channel:

```typescript
// { type: 'step-start', stepNumber }
// { type: 'text-delta' | 'reasoning-delta', text }
// { type: 'tool-call', toolCallId, toolName, args }
// { type: 'tool-result', toolCallId, toolName, result }
// { type: 'agent-call' | 'agent-result', agentName, session, input | result }
// { type: 'approval-request', toolCallId, toolName, args, reason?, runId? }
// { type: 'credential-request', toolCallId, toolName, credentialName,
//   credentialType: 'oauth2' | 'apikey', connectUrl?, runId }
// { type: 'usage', tokens: { input, output }, model }
// { type: 'transcript', text }                    // what the user was heard to say
// { type: 'audio-delta', data, format, text? } | { type: 'audio-done' }
// { type: 'data', name, data } | { type: 'generative-ui', spec }
// { type: 'suspended', reason: 'rpc-missing', missingRpcs }
// { type: 'interrupted', runId, text, reason }
// { type: 'error', message }
// { type: 'done' }
```

Every event except `agent-call`/`agent-result`/`suspended` also carries optional
`agent` and `session` fields, so a UI can attribute output to a sub-agent rather
than folding it into the parent's transcript.

## Usage Patterns

### Define an Agent

```typescript
import { pikkuAgent } from '#pikku/agent/pikku-agent-types.gen.js'
import { ref } from '#pikku/function'

export const todoAgent = pikkuAgent({
  name: 'todo-agent',
  description: 'Manages a todo list',
  goal: 'You help users manage their todos. You can list, add, complete and delete them.',
  model: 'openai/gpt-5-mini',
  tools: [
    ref('todos:listTodos'),
    ref('todos:addTodo'),
    ref('todos:completeTodo'),
    ref('graph:sleep'),
  ],
  memory: { storage: 'agentStorage', lastMessages: 20 },
  maxSteps: 10,
  toolChoice: 'auto',
})
```

### Scaffold the HTTP surface

```bash
pikku enable agent            # session required
pikku enable agent --noAuth   # public
```

The next `pikku all` generates `agent.gen.ts` — run/stream/approve/resume
callers plus thread listing endpoints, with thread ownership already enforced
against the session. Don't hand-write these routes.

### Structured output

An `output` schema fills `result.object`, but **only when the agent exposes no
tools** — with a tool present the runner falls back to free text, silently. If
you need both, split the classification into its own tool-free agent.

```typescript
export const structuredAgent = pikkuAgent({
  name: 'structured-agent',
  description: 'Classifies a message and returns a structured verdict',
  goal: 'You classify the sentiment of the user message.',
  model: 'openai/gpt-5-mini',
  output: z.object({ sentiment: z.string(), score: z.number() }),
})
```

### Narrowing tools per step

`prepareStep` runs before each step with the live tool array for that step, so
mutating it in place changes what the model is offered from there on. `stop()`
ends the loop — called before step 0 the run completes with an empty result
rather than signalling that it was short-circuited.

```typescript
prepareStep: ({ stepNumber, tools }) => {
  if (stepNumber >= 1) tools.length = 0 // withdraw tools after the first step
}
```

### Tool approval

A tool that should pause for a human sets `approvalRequired: true` (with an
optional `approvalDescription`) on the _function_, not on the agent. The run then
resolves with `status: 'suspended'` and `pendingApprovals`, and streaming emits
`approval-request`. Answer with `rpc.agent.approve(runId, approvals)`.

Authorization around tools is two-layer: an agent only sees tools its session can
reach, and the function's own `permissions` still guard the call when the model
picks one.

### Thread ownership

`resourceId` is caller-supplied but never trusted as an owner. The session's
principal (`userId`, or `orgId` when `sessionScope: 'org'`) is prefixed onto it,
so a client can sub-partition inside its own boundary and cannot read across one.
A sessionless run gets an ephemeral anonymous owner instead.

## Complete Example

```typescript
// functions/todos.functions.ts
export const listTodos = pikkuSessionlessFunc({
  description: 'List all todo items',
  func: async ({ db }, { status }) => {
    return { todos: await db.listTodos(status) }
  },
})

export const createTodo = pikkuFunc({
  description: 'Create a new todo item',
  func: async ({ db }, { text, priority, dueDate }) => {
    return await db.createTodo({ text, priority, dueDate })
  },
})

export const completeTodo = pikkuFunc({
  description: 'Mark a todo as complete',
  func: async ({ db }, { todoId }) => {
    return await db.completeTodo(todoId)
  },
})

// agents/todo-assistant.agent.ts
import { pikkuAgent } from '#pikku/agent/pikku-agent-types.gen.js'
import { ref } from '#pikku/function'

export const todoAssistant = pikkuAgent({
  name: 'todo-assistant',
  description: 'A helpful assistant that manages todos',
  role: 'You are an assistant that manages a user’s todo list.',
  personality: 'Concise. One short paragraph unless asked for detail.',
  goal: `Keep the user's todos accurate.
    - When creating todos, infer priority if not specified
    - When listing todos, summarize the results`,
  model: 'openai/gpt-5-mini',
  tools: [
    ref('todos:listTodos'),
    ref('todos:createTodo'),
    ref('todos:completeTodo'),
  ],
  memory: { storage: 'agentStorage', lastMessages: 20 },
  maxSteps: 5,
  temperature: 0.7,
})

// Wire to HTTP for a chat endpoint — or skip this entirely and run
// `pikku enable agent`, which scaffolds run/stream/approve/resume for you.
wireHTTP({
  method: 'post',
  route: '/chat',
  func: pikkuFunc({
    title: 'Chat',
    func: async (_services, { message, threadId }, { session, rpc }) => {
      return await rpc.agent.run('todo-assistant', {
        message,
        threadId,
        resourceId: session.userId,
      })
    },
  }),
})
```
