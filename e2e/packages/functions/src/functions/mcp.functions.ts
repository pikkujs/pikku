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
