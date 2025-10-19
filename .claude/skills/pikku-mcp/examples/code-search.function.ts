import { pikkuFunc, pikkuMCPResourceFunc } from '#pikku/pikku-types.gen.js'
import type { MCPResourceResponse } from '../pikku-types.gen.js'

/**
 * Domain function - performs the actual code search
 * This function can be used from HTTP, WebSocket, queues, CLI, or MCP
 */

type CodeSearchInput = {
  query: string
  limit?: number
}

type CodeSearchResult = Array<{
  file: string
  line: number
  content: string
}>

export const searchCode = pikkuFunc<CodeSearchInput, CodeSearchResult>({
  func: async ({ database }, input) => {
    const results = await database.query('code_index', {
      where: { content: { contains: input.query } },
      limit: input.limit ?? 20,
    })

    return results
  },
  docs: {
    summary: 'Search codebase',
    description: 'Search through codebase and return matching results',
    tags: ['code-search'],
  },
})

/**
 * MCP Resource adapter - formats search results for AI agents
 * CRITICAL: Always specify MCPResourceResponse as output type
 * RECOMMENDED: Use rpc.invoke() to call domain function, then format for MCP
 */

export const searchCodeMCP = pikkuMCPResourceFunc<
  CodeSearchInput,
  MCPResourceResponse
>({
  func: async ({ rpc }, input) => {
    // ✅ CORRECT: Use rpc.invoke() to call the domain function
    const results = await rpc.invoke('searchCode', input)

    // ✅ CORRECT: Return MCPResourceResponse format
    return [
      {
        uri: 'pikku://code-search',
        text: JSON.stringify(results),
      },
    ]
  },
  docs: {
    summary: 'Search codebase (MCP adapter)',
    tags: ['mcp', 'code-search'],
  },
})
