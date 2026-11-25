import { defineProvider } from '@pikku/core/provider'

/** Needs `cache` and `events`, so it is built and started after the cache. */
export const blob = defineProvider({
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
