import { defineProvider, defineProviderCollection } from '@pikku/core/provider'

export const things = defineProviderCollection<'things', { n: number }>(
  'things'
)
export const clash = defineProvider(() => ({ things: [] as never }))
