import { defineProvider, defineProviderCollection } from '@pikku/core/provider'

export const things = defineProviderCollection<'things', { n: number }>(
  'things'
)
export const item = defineProvider({ addTo: things, common: () => ({ n: 1 }) })
export const reader = defineProvider(({ things }) => ({
  reader: things.length,
}))
