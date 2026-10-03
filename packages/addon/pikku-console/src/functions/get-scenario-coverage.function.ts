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
    "What the scenario suite exercises: line coverage from the last `pikku scenario run --coverage`, the mutations no scenario drives, and the pages scenarios open. The app's routes come from its TanStack route files unless passed, and give the pages no scenario visits.",
  expose: true,
  scopes: ['pikku:console:scenarios:read'],
  func: async ({ metaService, pagesService }, input) => {
    const routes = input?.routes?.length
      ? input.routes
      : await pagesService?.routes()
    return readScenarioCoverage(metaService, routes?.length ? { routes } : {})
  },
})
