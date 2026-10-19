import { pikkuAgent, agent } from '#pikku/agent'
import { wireHTTP } from '#pikku/http'
import { listPublished } from '../functions/list-published.function.js'

/**
 * Offered only the public index, deliberately.
 *
 * `listDrafts` is not a tool here. Giving an agent the editorial list would put
 * unpublished writing one prompt away from anything with a connection, which is
 * a different risk from the same function being reachable behind a login.
 */
export const readingAssistant = pikkuAgent({
  name: 'reading-assistant',
  description: 'Helps a reader find something to read.',
  goal: 'Recommend published posts based on what the reader is interested in.',
  model: 'openai/gpt-4o-mini',
  tools: [listPublished],
  memory: { storage: 'aiStorage', lastMessages: 20 },
  maxSteps: 10,
})

wireHTTP({
  method: 'post',
  route: '/agents/reading',
  func: agent('readingAssistant'),
  auth: true,
})
