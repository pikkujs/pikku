import { pikkuAIAgent } from '#pikku/agent/pikku-agent-types.gen.js'
import { func } from '#pikku/pikku-types.gen.js'

export const emailAgent = pikkuAIAgent({
  name: 'email-agent',
  description: 'Sends and lists emails',
  goal: 'You help users send and view emails.',
  model: 'openai/o4-mini',
  tools: [func('agentCaller')],
  maxSteps: 5,
  toolChoice: 'auto',
})
