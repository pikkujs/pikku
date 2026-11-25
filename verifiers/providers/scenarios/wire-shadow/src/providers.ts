import { defineProvider, defineWireProvider } from '@pikku/core/provider'

export const held = defineProvider(() => ({ held: { n: 1 } }))
// A wire provider cannot provide a key a singleton already holds.
export const shadow = defineWireProvider(() => ({ held: { n: 2 } }))
