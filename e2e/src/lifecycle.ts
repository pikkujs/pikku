import { pikkuServerLifecycle } from '@pikku/core'
import type { SingletonServices } from './application-types.js'
import { seedAuthUsers } from './seed-auth.js'
import { seedScopes } from './seed-scopes.js'
import {
  startMockOAuthServer,
  stopMockOAuthServer,
} from '../tests/support/mock-oauth-server.js'

export const lifecycle = pikkuServerLifecycle<SingletonServices>({
  afterStart: async (services) => {
    await startMockOAuthServer()
    const apiBase = process.env.API_URL ?? `http://localhost:3000`
    await seedAuthUsers(services, apiBase)
    await seedScopes(services)
  },
  afterStop: async () => {
    stopMockOAuthServer()
  },
})
