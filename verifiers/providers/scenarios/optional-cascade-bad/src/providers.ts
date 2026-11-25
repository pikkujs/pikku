import { defineProvider } from '@pikku/core/provider'

export const maybe = defineProvider({
  optional: ['queueService'],
  common: ({ queueService }) =>
    queueService ? { sometimes: { on: true } } : {},
})

// Needs a key 'maybe' provides only sometimes, without listing it in optional.
export const consumer = defineProvider({
  common: ({ sometimes }) => ({ consumer: { sometimes } }),
})
