import { pikkuMCPResourceFunc } from '#pikku/pikku-types.gen.js'
import type { MCPResourceResponse } from '../pikku-types.gen.js'

/**
 * MCP Resource function
 * Resources provide data sources for AI models
 * CRITICAL: Always specify MCPResourceResponse as output type
 */

type CodeSearchInput = {
  query: string
  limit?: number
}

export const codeSearch = pikkuMCPResourceFunc<
  CodeSearchInput,
  MCPResourceResponse
>({
  docs: {
    summary: 'Search codebase',
    description: 'Search through codebase and return matching results',
    tags: ['mcp', 'code-search'],
    errors: [],
  },
  // ✅ CORRECT: Destructure services, use rpc for orchestration
  func: async ({ rpc }, input) => {
    const results = await rpc.invoke('searchCode', {
      query: input.query,
      limit: input.limit ?? 20,
    })

    // ✅ CORRECT: Return MCPResourceResponse format
    return [
      {
        uri: 'pikku://code-search',
        text: JSON.stringify(results),
      },
    ]
  },
})
