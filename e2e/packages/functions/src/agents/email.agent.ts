import { pikkuAgent } from '#pikku/agent/pikku-agent-types.gen.js'
import { ref } from '#pikku/function'

export const emailAgent = pikkuAgent({
  name: 'email-agent',
  description: 'Sends and lists emails',
  goal: 'You help users send and view emails.',
  model: 'chat',
  tools: [ref('emails:sendEmail'), ref('doubleValue')],
  maxSteps: 5,
  toolChoice: 'auto',
})
