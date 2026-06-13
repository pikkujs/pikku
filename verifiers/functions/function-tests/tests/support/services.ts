import { createDbUtils, type StubTracker } from '@pikku/cucumber'
import { createConfig } from '../../../src/services.js'
import { createSingletonServices } from '../../../src/services.js'

export const db = createDbUtils({ migrationsDir: '', seedFile: '' })

export async function createStubServices(
  _dbFile: string | null,
  tracker: StubTracker
) {
  const injected = new Proxy({} as Record<string, unknown>, {
    get(_, prop: string) {
      return tracker.stub(prop)
    },
  })
  const config = await createConfig()
  const services = await createSingletonServices(
    config as never,
    injected as never
  )
  return { services }
}
