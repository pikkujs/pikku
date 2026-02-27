---
name: pikku-ai-agent
description: 'Use when building AI agents, chatbots, or LLM-powered assistants with Pikku. Covers pikkuAIAgent, tool registration, memory, streaming, and agent invocation.'
---

# Pikku AI Agent Wiring

Build AI agents that use Pikku functions as tools. Agents support conversation memory, streaming, and multi-step tool execution.

## Before You Start

```bash
pikku info functions --verbose   # See existing functions that can be used as agent tools
pikku info tags --verbose        # Understand project organization
```

See `pikku-concepts` for the core mental model.

## API Reference

### `pikkuAIAgent(config)`

```typescript
import { pikkuAIAgent } from '#pikku'

pikkuAIAgent({
  name: string,                  // Unique agent identifier
  description: string,           // What the agent does
  instructions: string,          // System prompt / behavior instructions
  model: string,                 // LLM model (e.g. 'openai/gpt-4o-mini')
  tools: PikkuFunc[],            // Pikku functions the agent can call
  memory?: {
    storage: string,             // Service name for persistence (e.g. 'aiStorage')
    lastMessages: number,        // How many messages to retain in context
  },
  maxSteps?: number,             // Max tool-call rounds per invocation
  temperature?: number,          // LLM temperature (0-1)
})
```

### `runAIAgent(name, input, options)` — Non-streaming

```typescript
const result = await runAIAgent(
  agentName,
  {
    message: string, // User message
    threadId: string, // Conversation thread ID
    resourceId: string, // User/resource identifier
  },
  { singletonServices }
)

result.text // Agent's text response
result.steps // Array of tool calls made
result.usage // Token usage { input, output }
```

### `streamAIAgent(name, input, channel, options)` — Streaming

```typescript
await streamAIAgent(
  agentName,
  {
    message: string,
    threadId: string,
    resourceId: string,
  },
  channel,
  { singletonServices }
)

// Channel receives events:
// { type: 'text-delta', text: '...' }
// { type: 'tool-call', toolName: 'createTodo', args: {...} }
// { type: 'tool-result', result: {...} }
// { type: 'usage', tokens: { input: 150, output: 42 } }
// { type: 'done' }
```

## Usage Patterns

### Define an Agent

```typescript
const todoAssistant = pikkuAIAgent({
  name: 'todo-assistant',
  description: 'A helpful assistant that manages todos',
  instructions:
    'You help users manage their todo lists. Be concise and helpful.',
  model: 'openai/gpt-4o-mini',
  tools: [listTodos, createTodo, completeTodo],
  memory: {
    storage: 'aiStorage',
    lastMessages: 20,
  },
  maxSteps: 5,
  temperature: 0.7,
})
```

### Invoke Non-Streaming

```typescript
const result = await runAIAgent(
  'todo-assistant',
  {
    message: 'Create a task for tomorrow: buy groceries',
    threadId: 'thread-123',
    resourceId: 'user-456',
  },
  { singletonServices }
)

console.log(result.text) // "I've created a task 'buy groceries' for tomorrow."
console.log(result.steps) // [{ tool: 'createTodo', args: {...}, result: {...} }]
console.log(result.usage) // { input: 150, output: 42 }
```

### Stream Responses

```typescript
await streamAIAgent(
  'todo-assistant',
  {
    message: 'Create a task for tomorrow',
    threadId: 'thread-123',
    resourceId: 'user-456',
  },
  channel,
  { singletonServices }
)
```

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

// agents/todo-assistant.ts
const todoAssistant = pikkuAIAgent({
  name: 'todo-assistant',
  description: 'A helpful assistant that manages todos',
  instructions: `You help users manage their todo lists.
    - Be concise and helpful
    - When creating todos, infer priority if not specified
    - When listing todos, summarize the results`,
  model: 'openai/gpt-4o-mini',
  tools: [listTodos, createTodo, completeTodo],
  memory: {
    storage: 'aiStorage',
    lastMessages: 20,
  },
  maxSteps: 5,
  temperature: 0.7,
})

// Wire to HTTP for chat endpoint
wireHTTP({
  method: 'post',
  route: '/chat',
  func: pikkuFunc({
    title: 'Chat',
    func: async (services, { message, threadId }, wire) => {
      const session = await wire.session.get()
      return await runAIAgent(
        'todo-assistant',
        {
          message,
          threadId,
          resourceId: session.userId,
        },
        { singletonServices: services }
      )
    },
  }),
})
```
