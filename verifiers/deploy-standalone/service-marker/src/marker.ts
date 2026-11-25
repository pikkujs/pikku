import { defineProvider } from '@pikku/core/provider'

/**
 * Needs the entry's own logger. The `dev` variant is what lets `pikku all`
 * resolve it for `pikku dev`, where the project is also built.
 */
export const marker = defineProvider({
  dev: ({ logger }) => ({
    platformMarker: { from: 'wireAddon.providers', logger },
  }),
  deploy: ({ logger }) => ({
    platformMarker: { from: 'wireAddon.providers', logger },
  }),
})
