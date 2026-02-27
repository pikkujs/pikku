---
name: pikku-mcp
description: 'Use when exposing Pikku functions as MCP tools, resources, or prompts for AI assistants. Covers mcp: true flag, pikkuMCPResourceFunc, pikkuMCPPromptFunc, and MCP wire object.'
---

# Pikku MCP Wiring

Expose Pikku functions as Model Context Protocol (MCP) tools, resources, and prompts for AI assistants like Claude, ChatGPT, and others.

## Before You Start

```bash
pikku info functions --verbose   # See existing functions that could become MCP tools
pikku info tags --verbose        # Understand project organization
```

See `pikku-concepts` for the core mental model.

## API Reference

### MCP Tools (simplest approach)

Add `mcp: true` to any existing `pikkuFunc` to expose it as an MCP tool:

```typescript
const myFunc = pikkuFunc({
  description: string,      // Used as MCP tool description
  input: ZodSchema,         // Becomes MCP tool input schema
  output: ZodSchema,        // Return type
  mcp: true,                // ← Expose as MCP tool
  func: async (services, data) => { ... },
})
```

### MCP Resources (`pikkuMCPResourceFunc`)

```typescript
import { pikkuMCPResourceFunc } from '#pikku'

const resource = pikkuMCPResourceFunc({
  uri: string,              // URI template, e.g. 'todos/{id}'
  title: string,            // Human-readable title
  description?: string,
  func: async (services, data, { mcp }) => {
    // Must return array of { uri, text } or { uri, blob, mimeType }
    return [{ uri: mcp.uri!, text: JSON.stringify(result) }]
  },
})
```

### MCP Prompts (`pikkuMCPPromptFunc`)

```typescript
import { pikkuMCPPromptFunc } from '#pikku'

const prompt = pikkuMCPPromptFunc({
  name: string,
  description: string,
  func: async (services, data) => {
    // Must return array of MCP messages
    return [
      {
        role: 'user',
        content: { type: 'text', text: '...' },
      },
    ]
  },
})
```

### MCP Wire Object

Inside MCP-enabled functions, `wire.mcp` provides:

```typescript
mcp.uri // Current resource URI (for resources)
mcp.sendResourceUpdated(uri) // Notify clients a resource changed
mcp.enableTools({ toolName: true }) // Dynamically enable/disable tools
```

## Usage Patterns

### Expose Existing Functions as MCP Tools

The simplest path — add `mcp: true` to any function:

```typescript
export const createTodo = pikkuFunc({
  description: 'Create a new todo item',
  input: CreateTodoInput,
  output: CreateTodoOutput,
  mcp: true,
  func: async ({ db }, { text, priority }) => {
    return await db.createTodo({ text, priority })
  },
})
```

### MCP Resources with URI Templates

```typescript
export const getTodo = pikkuMCPResourceFunc({
  uri: 'todos/{id}',
  title: 'Todo Details',
  description: 'Get a todo by ID',
  func: async ({ db }, { id }, { mcp }) => {
    const todo = await db.getTodo(id)
    return [{ uri: mcp.uri!, text: JSON.stringify(todo) }]
  },
})
```

### MCP Prompts

```typescript
export const codeReview = pikkuMCPPromptFunc({
  name: 'codeReview',
  description: 'Generate a code review prompt',
  func: async ({}, { filePath, context }) => {
    return [
      {
        role: 'user',
        content: {
          type: 'text',
          text: `Review ${filePath}. Context: ${context}`,
        },
      },
    ]
  },
})
```

### Dynamic Tool Control

```typescript
export const manageTodos = pikkuFunc({
  description: 'Manage todo items',
  input: ManageTodosInput,
  output: ManageTodosOutput,
  mcp: true,
  func: async ({ db }, { action, id }, { mcp }) => {
    if (action === 'delete') {
      await db.deleteTodo(id)
      mcp.sendResourceUpdated(`todos/${id}`)
      await mcp.enableTools({ archiveTodos: true })
      return { deleted: true }
    }
  },
})
```

### MCP Server Setup

```typescript
// start.ts
import { PikkuMCPServer } from '@pikku/modelcontextprotocol'

const server = new PikkuMCPServer(config, singletonServices, createWireServices)
await server.init()
await server.start()
```

## Complete Example

```typescript
// functions/todos.functions.ts
export const listTodos = pikkuSessionlessFunc({
  description: 'List all todo items',
  input: ListTodosInput,
  output: ListTodosOutput,
  mcp: true,
  func: async ({ db }, { status }) => {
    return { todos: await db.listTodos(status) }
  },
})

export const createTodo = pikkuFunc({
  description: 'Create a new todo item',
  input: CreateTodoInput,
  output: CreateTodoOutput,
  mcp: true,
  func: async ({ db }, { text, priority }) => {
    return await db.createTodo({ text, priority })
  },
})

export const completeTodo = pikkuFunc({
  description: 'Mark a todo as complete',
  input: CompleteTodoInput,
  output: CompleteTodoOutput,
  mcp: true,
  func: async ({ db }, { todoId }) => {
    return await db.completeTodo(todoId)
  },
})

// functions/todos.mcp.ts
export const getTodoResource = pikkuMCPResourceFunc({
  uri: 'todos/{id}',
  title: 'Todo Details',
  description: 'Get details of a specific todo',
  func: async ({ db }, { id }, { mcp }) => {
    const todo = await db.getTodo(id)
    return [{ uri: mcp.uri!, text: JSON.stringify(todo) }]
  },
})

export const planDayPrompt = pikkuMCPPromptFunc({
  name: 'planDay',
  description: 'Create a daily plan based on pending todos',
  func: async ({ db }, {}) => {
    const { todos } = await db.listTodos('pending')
    return [
      {
        role: 'user',
        content: {
          type: 'text',
          text: `Plan my day. Here are my pending todos:\n${todos.map((t) => `- ${t.text} (${t.priority})`).join('\n')}`,
        },
      },
    ]
  },
})
```
