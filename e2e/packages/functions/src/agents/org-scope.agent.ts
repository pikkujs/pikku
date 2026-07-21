import { pikkuAIAgent } from '#pikku/agent/pikku-agent-types.gen.js'
import { ref } from '#pikku/pikku-types.gen.js'

export const orgScopeAgent = pikkuAIAgent({
  name: 'org-scope-agent',
  description: 'Partitions its threads by organization rather than by user',
  goal: 'You answer questions on behalf of an organization.',
  model: 'openai/gpt-5-mini',
  sessionScope: 'org',
  tools: [ref('openTool')],
  maxSteps: 5,
  toolChoice: 'auto',
})
