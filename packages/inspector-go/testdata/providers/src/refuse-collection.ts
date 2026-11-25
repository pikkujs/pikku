import { defineProvider, defineProviderCollection } from '@pikku/core/provider'

// PKU379: two collections with one name.
export const a = defineProviderCollection<'dup', number>('dup')
export const b = defineProviderCollection<'dup', number>('dup')
// PKU379: addTo is not a collection.
export const notCollection = { name: 'x' }
export const bad = defineProvider({ addTo: notCollection, common: () => ({ n: 1 }) } as never)
