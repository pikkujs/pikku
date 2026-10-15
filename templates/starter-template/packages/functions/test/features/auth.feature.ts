import { pikkuFeature } from '#pikku/scenarios'
import { signedInVirtualUserReachesTheAppScenario } from '../scenarios/signed-in-virtual-user-reaches-the-app.scenario.js'
import { sessionHealthScenario } from '../scenarios/session-health.scenario.js'

export const authFeature = pikkuFeature({
  name: 'Authentication',
  description:
    'A signed-in session reaches the gated app and identifies its user',
  tags: ['auth', 'smoke'],
  scenarios: [signedInVirtualUserReachesTheAppScenario, sessionHealthScenario],
})
