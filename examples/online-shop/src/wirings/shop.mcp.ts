import {
  wireMCPResource,
  wireMCPPrompt,
  pikkuMCPResourceFunc,
  pikkuMCPPromptFunc,
  pikkuMCPToolFunc,
} from '#pikku/mcp/pikku-mcp-types.gen.js'

// @snippet start mcpTools
// Wrap existing Pikku functions as MCP tools via RPC — same implementation, no duplication.
export const listCategoriesTool = pikkuMCPToolFunc({
  description: 'List all product categories in the shop',
  func: async (_services, _input, { rpc }) => {
    const result = await rpc.invoke('listCategories')
    return [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }]
  },
})

export const listItemsTool = pikkuMCPToolFunc<{
  categorySlug?: string
  search?: string
  limit?: number
  offset?: number
}>({
  description:
    'List shop items, optionally filtered by category or search query',
  func: async (
    _services,
    { categorySlug, search, limit = 20, offset = 0 },
    { rpc }
  ) => {
    // Spread the optional filters in only when they were supplied. Passing them
    // as explicit `undefined` fails validation with `Instances of "undefined"
    // type are not supported`, so calling this tool without a filter — the
    // ordinary case — was an internal error.
    const result = await rpc.invoke('listItems', {
      ...(categorySlug === undefined ? {} : { categorySlug }),
      ...(search === undefined ? {} : { search }),
      limit,
      offset,
    })
    return [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }]
  },
})

export const getItemTool = pikkuMCPToolFunc<{ itemId: string }>({
  description: 'Get full details for a specific shop item by ID',
  func: async (_services, { itemId }, { rpc }) => {
    const result = await rpc.invoke('getItem', { itemId })
    return [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }]
  },
})
// @snippet end mcpTools

// @snippet start mcpSingleTool
// Any Pikku function becomes an MCP tool — the same implementation already wired to HTTP.
export const getItemForAI = pikkuMCPToolFunc<{ itemId: string }>({
  description: 'Retrieve a shop item by its ID',
  func: async (_services, { itemId }, { rpc }) => {
    const result = await rpc.invoke('getItem', { itemId })
    return [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }]
  },
})
// @snippet end mcpSingleTool

// @snippet start mcpResource
// MCP resources let AI agents read data by URI template.
export const itemResource = pikkuMCPResourceFunc<{ itemId: string }>(
  async ({ kysely }, { itemId }, { mcp }) => {
    const item = await kysely
      .selectFrom('item')
      .selectAll()
      .where('itemId', '=', itemId)
      .executeTakeFirstOrThrow()
    return [{ uri: mcp.uri!, text: JSON.stringify(item) }]
  }
)

wireMCPResource({
  uri: 'shop://items/{itemId}',
  title: 'Shop Item',
  description: 'Retrieve a single shop item by ID',
  func: itemResource,
})
// @snippet end mcpResource

// @snippet start mcpPrompt
// MCP prompts give AI agents reusable conversation starters.
export const productRecommendation = pikkuMCPPromptFunc<{
  category: string
  budget: number
}>(async ({}, { category, budget }) => {
  return [
    {
      role: 'user' as const,
      content: {
        type: 'text' as const,
        text: `Recommend products in "${category}" under £${budget}. List top 3 with prices.`,
      },
    },
  ]
})

wireMCPPrompt({
  name: 'product_recommendation',
  description:
    'Generate a product recommendation prompt for a given category and budget',
  func: productRecommendation,
})
// @snippet end mcpPrompt

// @snippet start mcpWireObject
// Inside an MCP tool function, use the mcp wire object for dynamic control.
/**
 * A mutating tool, and a scope-gated one.
 *
 * It goes through `updateItem` rather than writing to the table directly. That
 * is what makes it safe: `updateItem` requires `catalogue:write`, and since MCP
 * carries the caller's request the scope is checked against the caller's real
 * session — an agent gets exactly the authority the person driving it has.
 *
 * Writing through `kysely` here instead would bypass that check, which is what
 * this tool used to do, back when nothing could authenticate an MCP call and a
 * scope had no session to be checked against.
 */
export const updateStockTool = pikkuMCPToolFunc<{
  itemId: string
  stock: number
}>({
  name: 'update_stock',
  description: 'Update stock level for a shop item',
  func: async (_services, { itemId, stock }, { mcp, rpc }) => {
    await rpc.invoke('updateItem', { itemId, stock })

    mcp.sendResourceUpdated(`shop://items/${itemId}`)
    await mcp.enableTools({ add_to_basket: stock > 0 } as any)

    return [
      { type: 'text', text: `Stock updated to ${stock} for item ${itemId}` },
    ]
  },
})
// @snippet end mcpWireObject
