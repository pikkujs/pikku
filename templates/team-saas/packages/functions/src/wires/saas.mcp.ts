import { pikkuMCPToolFunc } from '#pikku/mcp/pikku-mcp-types.gen.js'

/**
 * Tools go through `rpc.invoke`, so an agent is subject to the same scope and
 * the same tenancy permission as a person. In a multi-tenant product that is
 * not a nicety: an agent tool that queried the database directly would be a
 * cross-tenant read with none of the checks.
 */
// @snippet start mcpTools
export const listIssuesTool = pikkuMCPToolFunc<{
  orgId: string
  status?: 'open' | 'in_progress' | 'done' | 'closed'
  limit?: number
}>({
  description:
    'List issues in an organisation you belong to, optionally filtered by status',
  func: async (_services, input, { rpc }) => {
    const result = await rpc.invoke('listIssues', {
      orgId: input.orgId,
      // Spread in only when supplied. An explicit `undefined` fails validation
      // with `Instances of "undefined" type are not supported`, so listing
      // without a status filter — the ordinary case — was an internal error.
      ...(input.status === undefined ? {} : { status: input.status }),
      limit: input.limit ?? 50,
    })
    return [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }]
  },
})

export const closeIssueTool = pikkuMCPToolFunc<{
  issueId: string
  resolution?: 'done' | 'closed'
}>({
  description: 'Close an issue, or mark it done',
  func: async (_services, input, { rpc }) => {
    const result = await rpc.invoke('closeIssue', {
      issueId: input.issueId,
      resolution: input.resolution ?? 'done',
    })
    return [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }]
  },
})
// @snippet end mcpTools
