import { pikkuAgent } from '#pikku/agent/pikku-agent-types.gen.js'
import { ref } from '#pikku/pikku-types.gen.js'

export const emailAgent = pikkuAgent({
  name: 'email-agent',
  description: 'Sends and lists emails',
  goal: 'You help users send and view emails.',
  model: 'openai/gpt-5-mini',
  tools: [ref('emails:sendEmail'), ref('doubleValue')],
  maxSteps: 5,
  toolChoice: 'auto',
})
