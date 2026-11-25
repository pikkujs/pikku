import { defineProvider } from '@pikku/core/provider'

// Nothing provides queueService here, so the factory sees it undefined.
export const probe = defineProvider({
  optional: ['queueService'],
  common: ({ queueService }) => ({
    probe: { queueAbsent: queueService === undefined },
  }),
})
