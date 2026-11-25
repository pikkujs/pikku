import { defineProvider } from '@pikku/core/provider'
import { MARKER as OPENAI } from '@verifier/fake-openai'
import { aiProviders } from './collection.js'

export const openai = defineProvider({
  addTo: aiProviders,
  common: () => ({ name: 'openai', marker: OPENAI }),
})
