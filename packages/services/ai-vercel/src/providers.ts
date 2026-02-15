import type { AIAgentModelConfig } from '@pikku/core/ai-agent'

export interface OpenAIModelOptions {
  model: string
  temperature?: number
  maxTokens?: number
  topP?: number
  frequencyPenalty?: number
  presencePenalty?: number
  stopSequences?: string[]
}

export const openai = (options: OpenAIModelOptions): AIAgentModelConfig => ({
  provider: 'openai',
  ...options,
})

export interface AnthropicModelOptions {
  model: string
  temperature?: number
  maxTokens?: number
  topP?: number
  topK?: number
  stopSequences?: string[]
}

export const anthropic = (
  options: AnthropicModelOptions
): AIAgentModelConfig => ({
  provider: 'anthropic',
  ...options,
})

export interface GoogleModelOptions {
  model: string
  temperature?: number
  maxTokens?: number
  topP?: number
  topK?: number
  frequencyPenalty?: number
  presencePenalty?: number
  stopSequences?: string[]
}

export const google = (options: GoogleModelOptions): AIAgentModelConfig => ({
  provider: 'google',
  ...options,
})
