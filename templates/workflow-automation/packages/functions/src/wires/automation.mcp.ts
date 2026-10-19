import { pikkuMCPToolFunc } from '#pikku/mcp/pikku-mcp-types.gen.js'

/**
 * The platform, exposed to an AI agent.
 *
 * Every tool goes through `rpc.invoke`, so an agent asking to cancel a run is
 * subject to exactly the same `runs:cancel` scope and the same audit entry as
 * a person clicking cancel. A tool that touched the database directly would be
 * a second way in, with none of the checks — which in a system that can reach
 * every service the company has connected is not a small thing.
 */
// @snippet start mcpTools
export const listRunsTool = pikkuMCPToolFunc<{
  flowId?: string
  status?: 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled'
  limit?: number
}>({
  description:
    'List recent flow runs, optionally filtered by flow or status — use this to answer "did it run" and "why did it fail"',
  func: async (_services, input, { rpc }) => {
    // `limit` carries a zod default, so the RPC's input type has it present
    // rather than optional — the default is applied at the boundary, and the
    // function's own signature reflects the shape after that has happened.
    const result = await rpc.invoke('listRuns', {
      // Optional filters are spread in only when supplied. Passing them as
      // explicit `undefined` fails validation with `Instances of "undefined"
      // type are not supported`, so calling the tool without a filter — the
      // ordinary case — was an internal error.
      ...(input?.flowId === undefined ? {} : { flowId: input.flowId }),
      ...(input?.status === undefined ? {} : { status: input.status }),
      limit: input?.limit ?? 25,
    })
    return [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }]
  },
})

export const cancelRunTool = pikkuMCPToolFunc<{ runId: string; reason?: string }>({
  description: 'Cancel a queued or in-flight run',
  func: async (_services, input, { rpc }) => {
    const result = await rpc.invoke('cancelRun', input)
    return [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }]
  },
})
// @snippet end mcpTools
