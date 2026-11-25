import { defineWireProvider } from '@pikku/core/provider'
import { things } from './collections.js'
// PKU383 and PKU369: a wire provider cannot addTo a collection or run onServerStart.
export const wireItem = defineWireProvider({ addTo: things, common: () => ({ n: 1 }) } as never)
export const wireStart = defineWireProvider({ onServerStart: () => {}, common: () => ({ w: 1 }) } as never)
