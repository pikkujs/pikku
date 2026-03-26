import { pikkuAIAgent } from '#pikku/agent/pikku-agent-types.gen.js'
import { addon } from '#pikku/pikku-types.gen.js'

export const oauthApiAgent = pikkuAIAgent({
  name: 'oauth-api-agent',
  description: 'Checks user OAuth profile using per-user credentials',
  instructions:
    'You help users check their OAuth profile. Use the getProfile tool to fetch their authenticated profile.',
  model: 'openai/o4-mini',
  tools: [addon('oauth-api:getProfile')],
  maxSteps: 3,
  toolChoice: 'auto',
})
