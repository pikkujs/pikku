# Pikku MCP Wiring

## The shape of MCP in Pikku

MCP has three surfaces, and Pikku wires them differently:

| Surface      | Function factory                                    | Wiring                                    | Return type                                  |
| ------------ | --------------------------------------------------- | ----------------------------------------- | -------------------------------------------- |
| **Tool**     | `mcp: true` on a `pikkuFunc`, or `pikkuMCPToolFunc` | none — the function _is_ the registration | the func's own output, or MCP content blocks |
| **Resource** | `pikkuMCPResourceFunc`                              | `wireMCPResource({ uri, title, … })`      | `Array<{ uri, text }>`                       |
| **Prompt**   | `pikkuMCPPromptFunc`                                | `wireMCPPrompt({ name, description, … })` | `Array<MCPPromptMessage>`                    |

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
  description: 'Create a new todo item', // becomes the MCP tool description
  input: CreateTodoInput, // becomes the MCP tool input schema
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
import { pikkuMCPToolFunc } from '#pikku/mcp'

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
import { pikkuMCPResourceFunc } from '#pikku/mcp'

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
import { wireMCPResource } from '#pikku/mcp'

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
import { pikkuMCPPromptFunc, wireMCPPrompt } from '#pikku/mcp'

export const planDayPrompt = pikkuMCPPromptFunc({
  input: UserIdInputSchema,
  func: async (_services, { userId }, { rpc }) => {
    const { todos } = await rpc.invoke('listTodos', {
      userId,
      completed: false,
    })
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

## Reaching the server

You do not start an MCP server. `pikku dev`, `pikku serve` and a deployed app all
mount one for you: codegen writes `.pikku/mcp/mcp.gen.json`, the runtime loads it,
and the server is served at **`/mcp`** — so a tool you export is reachable at
`https://<your-app-url>/mcp` with nothing else to wire. Set `mcpPath` to move it.

Two consequences worth stating outright, because both read as breakage:

- The mount is **conditional on there being something to serve**. An `mcp.gen.json`
  with no tools, resources or prompts is not mounted at all, so `/mcp` 404s until
  the first `mcp: true` function or `pikkuMCP*Func` exists.
- There is no `wires/mcp` directory and no `mcp` block in `pikku.config.json`.
  A tool *is* its own registration, so the absence of both is what correct MCP
  wiring looks like — not evidence that something was missed.

When you add a tool, tell whoever asked for it the URL. An assistant that cannot
be pointed at an endpoint has not been connected to anything, and `/mcp` is the
whole answer.

## Red flags

| Symptom                                          | Cause                                                           |
| ------------------------------------------------ | --------------------------------------------------------------- |
| `wireMCPTool` is not exported                    | There is no tool wiring — use `mcp: true` or `pikkuMCPToolFunc` |
| `uri`/`title` rejected on `pikkuMCPResourceFunc` | Those belong on `wireMCPResource`                               |
| Resource returning `{ uri, blob, mimeType }`     | Resources are text only: `{ uri, text }`                        |
| Client sees a tool with no description           | `mcp: true` without a `description` — check the codegen warning |
| `/mcp` 404s                                      | Nothing to serve yet — the mount is skipped until one tool, resource or prompt exists |
