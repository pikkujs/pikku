import { pikkuMCPToolFunc } from '#pikku/mcp/pikku-mcp-types.gen.js'

/**
 * The hotel, exposed to an AI agent.
 *
 * Every tool goes through `rpc.invoke` rather than reimplementing the query, so
 * an agent is subject to exactly the same scopes, permissions and audit as a
 * receptionist clicking the same thing. A tool that talked to the database
 * directly would be a second, unguarded way in.
 */
// @snippet start mcpTools
export const listRoomsTool = pikkuMCPToolFunc<{
  floor?: number
  housekeepingStatus?: 'clean' | 'dirty' | 'inspected' | 'out_of_service'
}>({
  description:
    'List the hotel’s rooms, optionally filtered by floor or housekeeping status',
  func: async (_services, input, { rpc }) => {
    const result = await rpc.invoke('listRooms', input ?? {})
    return [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }]
  },
})

export const checkInTool = pikkuMCPToolFunc<{ bookingId: string; roomId?: string }>({
  description:
    'Check a guest in against their booking, assigning a clean room of the booked type',
  func: async (_services, input, { rpc }) => {
    const result = await rpc.invoke('checkIn', input)
    return [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }]
  },
})
// @snippet end mcpTools
