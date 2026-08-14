import { pikkuAgent } from '#pikku/agent/pikku-agent-types.gen.js'

export const agentMinimal = pikkuAgent({
  name: 'agent-minimal',
  description: 'Agent with only required fields',
  goal: 'Help users.',
  model: 'test-provider/test-model',
})

export const agentWithPersonality = pikkuAgent({
  name: 'agent-with-personality',
  description: 'Agent with personality, role, and goal',
  role: 'Technical support specialist',
  personality: 'Friendly and patient, explains complex topics simply',
  goal: 'Resolve user technical issues efficiently.',
  model: 'test-provider/test-model',
})
