import { defineProvider } from '@pikku/core/provider'

export const a = defineProvider({
  optional: ['queueService'],
  common: ({ queueService }) => (queueService ? { y: { on: true } } : {}),
})
export const b = defineProvider({
  optional: ['y'],
  common: ({ y }) => (y ? { z: { on: true } } : {}),
})
export const c = defineProvider({
  optional: ['z'],
  common: ({ z }) => ({ c: { sawZ: z !== undefined } }),
})
