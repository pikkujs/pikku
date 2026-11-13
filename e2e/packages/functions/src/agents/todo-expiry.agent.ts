import { pikkuAgent } from '#pikku/agent/pikku-agent-types.gen.js'
import { ref } from '#pikku/function'

/**
 * The todo agent with an approval that expires a millisecond after the run
 * suspends, so the expiry scenario can answer it late without waiting.
 */
export const todoExpiryAgent = pikkuAgent({
  expose: true,
  auth: false,
  name: 'todo-expiry-agent',
  description: 'Manages a todo list, with approvals that expire at once',
  goal: 'You help users add todos.',
  model: 'chat',
  tools: [ref('todos:addTodo')],
  maxSteps: 10,
  toolChoice: 'auto',
  approvalTtlMs: 1,
})
