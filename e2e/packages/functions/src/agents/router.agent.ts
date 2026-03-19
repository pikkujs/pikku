import { pikkuAIAgent } from '#pikku/agent/pikku-agent-types.gen.js'
import { todoAgent } from './todo.agent.js'
import { emailAgent } from './email.agent.js'

export const routerAgent = pikkuAIAgent({
  name: 'router-agent',
  description:
    'Main entry point — routes requests to the appropriate domain agent',
  instructions:
    'You are the Pikku assistant. Route user requests to the appropriate domain agent. Use the todo-agent for anything related to managing todos. Use the email-agent for anything related to sending or viewing emails.',
  model: 'openai/o4-mini',
  agents: [todoAgent, emailAgent],
  maxSteps: 10,
})
