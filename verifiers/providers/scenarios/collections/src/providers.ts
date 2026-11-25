import { defineProviderCollection } from '@pikku/core/provider'
import { defineProvider } from '#pikku/provider'

export const things = defineProviderCollection<'things', { n: number }>(
  'things'
)
export const one = defineProvider({ addTo: things, common: () => ({ n: 1 }) })
export const two = defineProvider({ addTo: things, common: () => ({ n: 2 }) })
export const reader = defineProvider(({ things }) => ({
  reader: { labels: things.map((t) => t.label) },
}))
