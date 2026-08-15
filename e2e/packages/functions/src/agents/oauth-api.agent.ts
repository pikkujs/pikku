import { pikkuAgent } from '#pikku/agent/pikku-agent-types.gen.js'
import { ref } from '#pikku/pikku-types.gen.js'

export const oauthApiAgent = pikkuAgent({
  name: 'oauth-api-agent',
  description: 'Checks user OAuth profile using per-user credentials',
  goal: 'You help users check their OAuth profile. Use the getProfile tool to fetch their authenticated profile.',
  model: 'openai/gpt-5.6-luna',
  tools: [ref('oauth-api:getProfile')],
  maxSteps: 3,
  toolChoice: 'auto',
})
