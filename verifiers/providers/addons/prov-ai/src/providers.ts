import { defineProvider, defineProviderCollection } from '@pikku/core/provider'
import { MARKER as OPENAI } from '@verifier/fake-openai'
import { MARKER as ANTHROPIC } from '@verifier/fake-anthropic'

export interface AiProviderItem {
  name: string
  marker: string
}
export const aiProviders = defineProviderCollection<
  'aiProviders',
  AiProviderItem
>('aiProviders')

export const openai = defineProvider({
  addTo: aiProviders,
  common: () => ({ name: 'openai', marker: OPENAI }),
})
export const anthropic = defineProvider({
  addTo: aiProviders,
  common: () => ({ name: 'anthropic', marker: ANTHROPIC }),
})
