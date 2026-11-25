import { defineProvider } from '@pikku/core/provider'

const keys = ['queueService']
export const p = defineProvider({
  optional: keys as never,
  common: () => ({ p: 1 }),
})
