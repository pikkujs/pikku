import { pikkuFunc } from '#pikku/addon/function'
import {
  readScenarioCoverage,
  type ScenarioCoverage,
} from '@pikku/core/scenario/coverage'

export const getScenarioCoverage = pikkuFunc<
  { routes?: string[] },
  ScenarioCoverage
>({
  title: 'Get Scenario Coverage',
  description:
    'What the scenario suite exercises: line coverage from the last `pikku scenario run --coverage`, the mutations no scenario drives, and the pages scenarios open. Pass the app routes to also get the ones no scenario visits.',
  expose: true,
  scopes: ['pikku:console:scenarios:read'],
  func: async ({ metaService }, input) =>
    readScenarioCoverage(metaService, input),
})
