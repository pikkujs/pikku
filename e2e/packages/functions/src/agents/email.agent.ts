import { pikkuAIAgent } from '#pikku/agent/pikku-agent-types.gen.js'
import { addon } from '#pikku/pikku-types.gen.js'

export const emailAgent = pikkuAIAgent({
  name: 'email-agent',
  description: 'Sends and lists emails',
  instructions: 'You help users send and view emails.',
  model: 'openai/gpt-4o',
  tools: [addon('emails:sendEmail'), addon('emails:listEmails')],
  maxSteps: 5,
  toolChoice: 'auto',
})
