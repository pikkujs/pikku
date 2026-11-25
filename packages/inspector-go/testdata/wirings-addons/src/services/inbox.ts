import { defineProvider } from '@pikku/core/provider'

export const inbox = defineProvider({
  dev: ({ logger }) => ({ inbox: logger }),
  deploy: async ({ kysely, logger }) => ({ inbox: kysely, inboxMetrics: logger }),
})
