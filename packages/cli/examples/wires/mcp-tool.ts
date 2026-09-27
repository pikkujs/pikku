//~ name: mcp-tool
//~ title: MCP tool — expose an app action to an external AI client (Claude, etc.)
//~ when: You want an OUTSIDE AI assistant to drive the app over the Model Context Protocol (create a record, look something up). For an IN-APP assistant/chatbot use {name: ai-agent} instead.
//~ entity: todo

// ===== FILE: packages/functions/src/functions/create-todo-tool.function.ts =====
import { z } from 'zod'
import { pikkuMCPToolFunc } from '#pikku/mcp'

//~ An MCP tool is AUTO-SERVED from its export — there is NO wire*() call (unlike
//~ resources/prompts). Give it a clear `description` (the client picks tools by
//~ it) and an `input` zod. The 3rd arg carries `rpc` — CALL YOUR EXISTING RPCs
//~ through it instead of re-implementing logic; the return is MCP content parts.
//~ input is a named const, never inline at the input: site (PKU489).
export const CreateTodoToolInput = z.object({ title: z.string(), userId: z.string() })

export const createTodoTool = pikkuMCPToolFunc({
  description: 'Create a todo with a title for the current user.',
  input: CreateTodoToolInput,
  func: async (_services, input, { rpc }) => {
    //~ Reuse the app's own createTodo RPC — one source of truth for the write.
    const result = await rpc.invoke('createTodo', input)
    return [
      { type: 'text' as const, text: `Created todo "${result.todo.title}" (${result.todo.id})` },
    ]
  },
})
