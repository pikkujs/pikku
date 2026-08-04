---
name: pikku-mcp
description: >-
  Use when exposing Pikku functions as MCP tools, resources, or prompts for AI assistants. Covers
  mcp: true, pikkuMCPToolFunc, pikkuMCPResourceFunc, pikkuMCPPromptFunc, wireMCPResource,
  wireMCPPrompt, the MCP wire object and PikkuMCPServer. TRIGGER when: code uses mcp: true or any
  pikkuMCP*Func/wireMCP* helper, user asks about MCP, Model Context Protocol, AI tool integration,
  or exposing functions to Claude/ChatGPT. DO NOT TRIGGER when: user asks about AI agents (use
  pikku-ai-agent) or general function definitions (use pikku-concepts).
installGroups: [core]
---

# Pikku MCP Wiring

## Agent Operating Procedure

Use this skill as an execution checklist, not reference material.

1. Discover before editing. Run the relevant `pikku meta ... --json` command and inspect only the focused output you need.
2. Identify the source files that own the behavior. Do not start by reading generated output, `.pikku`, `node_modules`, vendored packages, or broad build artifacts.
3. Make the smallest source change that satisfies the task. Keep generated files generated, and avoid hand-editing SDKs, schema output, or typegen.
4. Validate with the narrowest relevant command first, then run `pikku-verify` or `pikku all` when functions, wirings, schemas, or generated clients may have changed.
5. If validation fails, fix the source cause and rerun validation. Do not paper over generated errors by editing generated files.

Expose Pikku functions as Model Context Protocol (MCP) tools, resources, and prompts for AI assistants like Claude, ChatGPT, and others.

## Before You Start

```bash
pikku info functions --verbose   # See existing functions that could become MCP tools
pikku info tags --verbose        # Understand project organization
```

See `pikku-concepts` for the core mental model.

## The shape of MCP in Pikku

MCP has three surfaces, and Pikku wires them differently:

| Surface | Function factory | Wiring | Return type |
| --- | --- | --- | --- |
| **Tool** | `mcp: true` on a `pikkuFunc`, or `pikkuMCPToolFunc` | none — the function *is* the registration | the func's own output, or MCP content blocks |
| **Resource** | `pikkuMCPResourceFunc` | `wireMCPResource({ uri, title, … })` | `Array<{ uri, text }>` |
| **Prompt** | `pikkuMCPPromptFunc` | `wireMCPPrompt({ name, description, … })` | `Array<MCPPromptMessage>` |

Tools are the odd one out — there is no `wireMCPTool`. Resources and prompts
carry protocol metadata (a URI template, a prompt name) that belongs to the
endpoint rather than the implementation, so that metadata lives on the wiring and
the `pikkuMCP*Func` factory stays a plain function.

Import every factory and wiring from `#pikku`.

## API Reference

### Tools

Add `mcp: true` to any existing function:

```typescript
export const createTodo = pikkuFunc({
  description: 'Create a new todo item',   // becomes the MCP tool description
  input: CreateTodoInput,                  // becomes the MCP tool input schema
  output: CreateTodoOutput,
  mcp: true,
  func: async ({ db }, { text, priority }) => db.createTodo({ text, priority }),
})
```

A missing `description` is all an assistant has to go on, so codegen warns about
it rather than failing — treat the warning as a bug.

Use `pikkuMCPToolFunc` when the tool should control its own presentation. It
returns MCP content blocks (`{ type: 'text', text }` or `{ type: 'image', data }`
with base64), so the assistant reads prose rather than raw JSON:

```typescript
import { pikkuMCPToolFunc } from '#pikku'

export const createTodoTool = pikkuMCPToolFunc({
  description: 'Create a todo item with title, priority, due date and tags',
  input: CreateTodoWithUserInputSchema,
  func: async (_services, input, { rpc }) => {
    const { todo } = await rpc.invoke('createTodo', input)
    return [
      { type: 'text' as const, text: `Created "${todo.title}" (${todo.id})` },
    ]
  },
})
```

It also accepts `name`, `title`, `summary`, `tags`, `middleware` and
`permissions`. The function is sessionless and gets `mcp` and `rpc` on its wire —
calling existing business functions through `rpc.invoke` keeps the tool a thin
presentation layer over logic that is already tested and reachable over HTTP.

### Resources

```typescript
import { pikkuMCPResourceFunc } from '#pikku'

export const getTodoResource = pikkuMCPResourceFunc<{ id: string }>(
  async (_services, { id }, { rpc, mcp }) => {
    const { todo } = await rpc.invoke('getTodo', { id })
    return [
      {
        uri: mcp.uri!,
        text: todo ? formatTodo(todo) : `Todo "${id}" not found.`,
      },
    ]
  }
)
```

The factory takes either a bare function (as above) or a config object — `{ func, name }`,
or `{ func, input }` with a schema. A resource returns `Array<{ uri, text }>`;
it is text only, with no blob variant. `mcp.uri` is the concrete URI the client
asked for, which is why each entry echoes it back.

```typescript
import { wireMCPResource } from '#pikku'

wireMCPResource({
  uri: 'todos/{id}', // URI template
  title: 'Todo Details',
  description: 'Get details of a specific todo by ID',
  func: getTodoResource,
  tags: ['todos'],
  // also: summary?, mimeType?, size?, streaming?, errors?, middleware?
})
```

Every `{param}` in `uri` is checked against the function's input at compile time,
so `todos/{id}` wired to a function whose input has no `id` fails to build rather
than handing the function an `undefined`.

### Prompts

```typescript
import { pikkuMCPPromptFunc, wireMCPPrompt } from '#pikku'

export const planDayPrompt = pikkuMCPPromptFunc({
  input: UserIdInputSchema,
  func: async (_services, { userId }, { rpc }) => {
    const { todos } = await rpc.invoke('listTodos', { userId, completed: false })
    return [
      {
        role: 'user' as const,
        content: {
          type: 'text' as const,
          text: `Plan my day:\n${todos.map(formatTodo).join('\n')}`,
        },
      },
    ]
  },
})

wireMCPPrompt({
  name: 'planDay',
  description: 'Generate a daily plan based on pending todos',
  func: planDayPrompt,
  tags: ['productivity'],
})
```

A message's `role` is `'user' | 'assistant' | 'system'` and its `content.type` is
`'text' | 'image'`. The prompt arguments the client sees are derived from the
input schema at codegen time: each property becomes a named argument, and
schema-required properties become required arguments.

### MCP Wire Object

Available as `wire.mcp` inside any MCP function:

```typescript
mcp.uri // the resolved resource URI (resources only)
mcp.sendResourceUpdated(uri) // notify clients a resource changed
await mcp.enableTools({ archiveTodos: true })
await mcp.enableResources({ todoDetails: false })
await mcp.enablePrompts({ planDay: true })
```

The `enable*` calls are how a server presents a changing surface — hiding tools
that are meaningless in the current state beats letting the assistant call them
and fail. Each returns a boolean, and each name is typechecked against your
generated endpoint names.

```typescript
export const deleteTodo = pikkuFunc({
  description: 'Delete a todo item',
  mcp: true,
  func: async ({ db }, { id }, { mcp }) => {
    await db.deleteTodo(id)
    mcp.sendResourceUpdated(`todos/${id}`)
    return { deleted: true }
  },
})
```

## MCP Server Setup

`PikkuMCPServer` takes the server config and a logger — not your services. It
loads the generated `mcp.gen.json`, and the bootstrap import is what registers
your functions.

```typescript
// start.ts
import { PikkuMCPServer } from '@pikku/modelcontextprotocol'
import { createConfig, createSingletonServices } from './services.js'
import mcpJSON from '../.pikku/mcp/mcp.gen.json' with { type: 'json' }
import '../.pikku/pikku-bootstrap.gen.js'

const config = await createConfig()
const singletonServices = await createSingletonServices(config)

const server = new PikkuMCPServer(
  {
    name: 'pikku-mcp-server',
    version: '1.0.0',
    mcpJSON,
    capabilities: { logging: {}, tools: {}, resources: {}, prompts: {} },
  },
  singletonServices.logger
)

await server.init()

// stdio — the transport desktop MCP clients spawn
await server.connectStdio()
singletonServices.logger = server.createMCPLogger()

// …or streamable HTTP, for a hosted server
const { close } = await server.connectHTTP({ port: 3000, host: '127.0.0.1' })
```

`capabilities` is a filter, not documentation: a surface you leave out is not
advertised and its endpoints are never loaded, which is how you ship a tools-only
server.

Over stdio the protocol owns stdout, so an ordinary console logger corrupts the
frames — that is what `createMCPLogger()` is for. Swap the logger before
anything logs.

## Red flags

| Symptom | Cause |
| --- | --- |
| `wireMCPTool` is not exported | There is no tool wiring — use `mcp: true` or `pikkuMCPToolFunc` |
| `uri`/`title` rejected on `pikkuMCPResourceFunc` | Those belong on `wireMCPResource` |
| Resource returning `{ uri, blob, mimeType }` | Resources are text only: `{ uri, text }` |
| Client sees a tool with no description | `mcp: true` without a `description` — check the codegen warning |
| stdio client disconnects on the first log line | Logger still writing to stdout; use `createMCPLogger()` |
