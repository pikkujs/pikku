import { defineProvider, defineWireProvider } from '@pikku/core/provider'

export const injector = defineProvider(() => ({ injected: { n: 1 } }))
export const reader = defineWireProvider(({ injected }) => ({
  readerSaw: injected,
}))
