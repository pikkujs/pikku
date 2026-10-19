import { pikkuAgent, agent } from '#pikku/agent'
import { wireHTTP } from '#pikku/http'
import { listRooms } from '../functions/list-rooms.function.js'
import { checkIn } from '../functions/check-in.function.js'

/**
 * The concierge. Its tools are the same functions the front desk calls, so the
 * agent is subject to the same scopes and the same audit as a receptionist —
 * an agent with its own data access would be a second, unguarded front desk.
 */
export const frontDeskAssistant = pikkuAgent({
  name: 'front-desk-assistant',
  description: 'Helps the front desk find a room and check a guest in.',
  goal: 'Answer questions about room availability and check guests in against their booking.',
  model: 'openai/gpt-4o-mini',
  tools: [listRooms, checkIn],
  memory: { storage: 'aiStorage', lastMessages: 20 },
  maxSteps: 10,
})

wireHTTP({
  method: 'post',
  route: '/agents/front-desk',
  func: agent('frontDeskAssistant'),
  auth: true,
})
