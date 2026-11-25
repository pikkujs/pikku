import {
  defineProviderCollection,
  defineWireProvider,
} from '@pikku/core/provider'

export const things = defineProviderCollection<'things', { n: number }>(
  'things'
)
// PKU383 and PKU369: a wire provider cannot addTo a collection or run onServerStart.
export const wireItem = defineWireProvider({
  addTo: things,
  common: () => ({ n: 1 }),
} as never)
export const wireStart = defineWireProvider({
  onServerStart: () => {},
  common: () => ({ w: 1 }),
} as never)
