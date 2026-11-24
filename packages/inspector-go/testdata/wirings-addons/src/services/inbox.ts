import { pikkuService } from '@pikku/core/pikku-service'

export const inbox = pikkuService({
  dev: ({ logger }) => ({ inbox: logger }),
  deploy: async ({ kysely, logger }) => ({ inbox: kysely, inboxMetrics: logger }),
})
