import { pikkuMCPToolFunc } from '#pikku/mcp/pikku-mcp-types.gen.js'

/**
 * The public index is offered as a tool; the editorial list is not.
 *
 * An agent reaching `listPublished` is doing what any reader could. Offering
 * `listDrafts` would put unpublished writing one prompt away from anything with
 * an MCP connection, which is a different risk from the same code being
 * reachable behind a login.
 */
// @snippet start mcpTools
export const listPublishedTool = pikkuMCPToolFunc<{ tagSlug?: string; limit?: number }>({
  description: 'List the publication’s published posts, newest first',
  func: async (_services, input, { rpc }) => {
    // `tagSlug` is spread in only when the caller sent one. An explicit
    // `tagSlug: undefined` is not the same as an absent key to the schema
    // validator — it rejects the call with `Instances of "undefined" type are
    // not supported`, so every unfiltered use of this tool failed.
    const result = await rpc.invoke('listPublished', {
      ...(input?.tagSlug === undefined ? {} : { tagSlug: input.tagSlug }),
      limit: input?.limit ?? 20,
    })
    return [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }]
  },
})
// @snippet end mcpTools
