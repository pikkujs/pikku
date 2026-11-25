import { defineProvider } from '@pikku/core/provider'

/**
 * Provides the `events` list the other services append to, so a check can read
 * the order hooks and teardown ran in. Teardown is the provided value's own
 * `stop()`.
 */
export const cache = defineProvider({
  common: () => {
    const events: string[] = []
    return {
      events,
      cache: {
        label: 'cache',
        stop: async () => {
          events.push('stop:cache')
        },
      },
    }
  },
  onServerStart: async (services) => {
    services.events.push('start:cache')
  },
})
