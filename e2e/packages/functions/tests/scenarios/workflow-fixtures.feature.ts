import { pikkuFeature } from '#pikku/scenario'
import { orderSupportScenario } from '../../src/workflows/order-support.scenario.js'
import { notificationScenario } from '../../src/workflows/stub-notifications.scenario.js'
import { failingScenario } from '../../src/workflows/failing.scenario.js'

export const workflowFixturesFeature = pikkuFeature({
  document: false,
  name: 'Workflow fixtures',
  description:
    'The scenarios the suite runs against itself: a two-actor order journey, the notification stubs, and one that always fails so the exit code can be asserted',
  tags: ['test-fixture'],
  scenarios: [orderSupportScenario, notificationScenario, failingScenario],
})
