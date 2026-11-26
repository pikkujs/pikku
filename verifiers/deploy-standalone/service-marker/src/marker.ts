import { pikkuService } from '@pikku/core/pikku-service'

/**
 * Needs the entry's own logger. The `dev` variant is what lets `pikku all`
 * resolve it for `pikku dev`, where the project is also built.
 */
export const marker = pikkuService({
  dev: ({ logger }) => ({
    platformMarker: { from: 'wireAddon.services', logger },
  }),
  deploy: ({ logger }) => ({
    platformMarker: { from: 'wireAddon.services', logger },
  }),
})
