import { defineProviderCollection } from '@pikku/core/provider'

export interface AiProviderItem {
  name: string
  marker: string
}
export const aiProviders = defineProviderCollection<
  'aiProviders',
  AiProviderItem
>('aiProviders')
