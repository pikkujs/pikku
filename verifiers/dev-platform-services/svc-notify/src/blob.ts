import { pikkuService } from '@pikku/core/pikku-service'

/** Needs `cache` and `events`, so it is built and started after the cache. */
export const blob = pikkuService({
  common: ({ cache, events }) => ({
    blob: {
      label: `blob-of-${cache.label}`,
      stop: async () => {
        events.push('stop:blob')
      },
    },
  }),
  onServerStart: async (services) => {
    services.events.push('start:blob')
  },
})
