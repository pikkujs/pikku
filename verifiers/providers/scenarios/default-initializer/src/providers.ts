import { defineProvider } from '@pikku/core/provider'

// A default initializer does not make a need optional.
export const probe = defineProvider({
  // oxlint-disable-next-line typescript/no-useless-default-assignment
  common: ({ queueService = undefined }) => ({ probe: { queueService } }),
})
