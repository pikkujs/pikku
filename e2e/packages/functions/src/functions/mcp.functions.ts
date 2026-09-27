import { pikkuFunc, pikkuSessionlessFunc } from '#pikku/function'
import { pikkuMCPToolFunc } from '#pikku/mcp/pikku-mcp-types.gen.js'

export const mcpToolWithDescription = pikkuMCPToolFunc<{ input: string }>({
  description: 'A test MCP tool with a proper description',
  func: async (_services, { input }) => {
    return [{ type: 'text', text: `Processed: ${input}` }]
  },
})

export const mcpToolWithoutDescription = pikkuMCPToolFunc<{ input: string }>({
  func: async (_services, { input }) => {
    return [{ type: 'text', text: `Processed: ${input}` }]
  },
})

/**
 * A public tool and a private one on the same endpoint.
 *
 * An MCP server is not gated as a whole: a `pikkuSessionlessFunc` is reachable
 * by anyone who connects, and anything needing a session is answered with a
 * `401` and an OAuth challenge instead of being dispatched. Both halves have to
 * hold at once for a remote server to be usable — a client discovers the
 * catalogue before it has a token, and learns from the refusal where to get
 * one — so the pair is what the scenarios drive a real MCP client against.
 */
export const mcpPublicCatalogue = pikkuSessionlessFunc<void, string>({
  mcp: true,
  description: 'Lists what this server offers, to anyone who asks',
  func: async () => 'catalogue: todos, reports',
})

export const mcpWhoAmITool = pikkuFunc<void, string>({
  mcp: true,
  description: 'Reports which user the caller is signed in as',
  func: async (_services, _data, { session }) =>
    `signed in as ${session.userId}`,
})
