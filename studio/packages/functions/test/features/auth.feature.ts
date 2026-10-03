import { pikkuFeature } from '#pikku/scenarios'
import { signedInActorReachesTheAppScenario } from '../scenarios/signed-in-actor-reaches-the-app.scenario.js'

export const authFeature = pikkuFeature({
  name: 'Authentication',
  description: 'A signed-in session reaches the gated app and identifies its user',
  tags: ['auth', 'smoke'],
  scenarios: [signedInActorReachesTheAppScenario],
})
