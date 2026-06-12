import type { DbUtils, StubTracker } from '@pikku/cucumber'

export const db: DbUtils = {
  buildBaseDb: () => '',
  freshScenarioDb: () => '',
  removeScenarioDb: () => {},
  teardownDb: () => {},
}

export async function createStubServices(
  _dbFile: string,
  tracker: StubTracker
) {
  const services = new Proxy({} as Record<string, unknown>, {
    get(_, prop: string) {
      if (prop === 'schema') return undefined
      return tracker.stub(prop)
    },
  })
  return { services }
}
