import { pikkuAIAgent } from '#pikku/agent/pikku-agent-types.gen.js'
import { todoAgent } from './todo.agent.js'

export const supervisorAgent = pikkuAIAgent({
  name: 'supervisor-agent',
  description:
    'Supervises todo operations — sub-agent results are returned to this agent, not streamed to the user',
  instructions:
    'You supervise todo operations. Delegate todo requests to the todo-agent. When you get the result back, summarize it for the user. Always prefix your response with "SUPERVISOR:".',
  model: 'openai/gpt-4o',
  agents: [todoAgent],
  agentMode: 'supervise',
  maxSteps: 10,
})
