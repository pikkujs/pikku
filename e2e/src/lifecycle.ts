import { pikkuServerLifecycle } from '@pikku/core/utils'
import type { SingletonServices } from './application-types.js'
import { seedAuthUsers, seedScenarioVirtualUsers } from './seed-auth.js'
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
    const { variables } = services
    await startMockOAuthServer()
    await startMockRegistryServer()
    const apiBase = String(
      (await variables.get('API_URL')) ?? `http://localhost:3000`
    )
    await seedAuthUsers(services, apiBase)
    await seedScenarioVirtualUsers(services)
    await seedScopes(services)
  },
  afterStop: async () => {
    stopMockOAuthServer()
    stopMockRegistryServer()
  },
})
