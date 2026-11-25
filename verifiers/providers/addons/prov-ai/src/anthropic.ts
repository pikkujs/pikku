import { defineProvider } from '@pikku/core/provider'
import { MARKER as ANTHROPIC } from '@verifier/fake-anthropic'
import { aiProviders } from './collection.js'

export const anthropic = defineProvider({
  addTo: aiProviders,
  common: () => ({ name: 'anthropic', marker: ANTHROPIC }),
})
