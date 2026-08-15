import { pikkuServerLifecycle } from '@pikku/core/ecosystem/types'
import type { SingletonServices } from './application-types.js'
import { seedAuthUsers, seedScenarioActors } from './seed-auth.js'
import { seedScopes } from './seed-scopes.js'
import {
  startMockOAuthServer,
  stopMockOAuthServer,
} from './mock-oauth-server.js'
import {
  startMockRegistryServer,
  stopMockRegistryServer,
} from './mock-registry-server.js'

export const lifecycle = pikkuServerLifecycle<SingletonServices>({
  afterStart: async (services) => {
    await startMockOAuthServer()
    await startMockRegistryServer()
    const apiBase = process.env.API_URL ?? `http://localhost:3000`
    await seedAuthUsers(services, apiBase)
    await seedScenarioActors(services, apiBase)
    await seedScopes(services)
  },
  afterStop: async () => {
    stopMockOAuthServer()
    stopMockRegistryServer()
  },
})
