import { pikkuServerLifecycle } from '@pikku/core'
import { seedAuthUsers } from './seed-auth.js'
import {
  startMockOAuthServer,
  stopMockOAuthServer,
} from '../tests/support/mock-oauth-server.js'

export const lifecycle = pikkuServerLifecycle({
  afterStart: async (services) => {
    await startMockOAuthServer()
    const apiBase = process.env.API_URL ?? `http://localhost:3000`
    await seedAuthUsers(services, apiBase)
  },
  afterStop: async () => {
    stopMockOAuthServer()
  },
})
