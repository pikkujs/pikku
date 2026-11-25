import { defineProvider, defineProviderCollection } from '@pikku/core/provider'

export const things = defineProviderCollection<'things', { n: number }>(
  'things'
)
export const reader = defineProvider(({ things }) => ({
  reader: { count: things.length },
}))
