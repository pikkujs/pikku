import { pikkuFeature } from '#pikku/scenarios'
import { shopperBuysAnItem, shopperAsksTheAssistant } from './shop.scenario.js'
import { sessionHealthScenario } from '../functions/session-health.scenario.js'

// @snippet start scenarioFeature
// A feature groups scenarios the way gherkin groups them. Scenarios are
// referenced by imported identifier, so renaming or deleting one is a compile
// error, and a run stamps the feature onto every result.
export const shopFeature = pikkuFeature({
  name: 'Shop',
  tags: ['shop'],
  scenarios: [
    sessionHealthScenario,
    shopperBuysAnItem,
    shopperAsksTheAssistant,
  ],
})
// @snippet end scenarioFeature
