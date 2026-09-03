import { pikkuAgent } from '#pikku/agent/pikku-agent-types.gen.js'
import { ref } from '#pikku/function'

export const orgScopeAgent = pikkuAgent({
  name: 'org-scope-agent',
  description: 'Partitions its threads by organization rather than by user',
  goal: 'You answer questions on behalf of an organization.',
  model: 'chat',
  sessionScope: 'org',
  tools: [ref('openTool')],
  maxSteps: 5,
  toolChoice: 'auto',
})
