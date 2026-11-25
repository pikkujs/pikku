import { defineProvider } from '@pikku/core/provider'
import { analyticsSinks } from '@pikku/core/analytics'

export const sinkA = defineProvider({
  addTo: analyticsSinks,
  common: () => ({ sink: { write: async () => {} }, map: {} }),
})
export const sinkB = defineProvider({
  addTo: analyticsSinks,
  common: () => ({ sink: { write: async () => {} }, map: {} }),
})
