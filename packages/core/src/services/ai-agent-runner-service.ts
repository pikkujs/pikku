import type {
  AIMessage,
  AIAgentStep,
  AIAgentToolDef,
  AIStreamChannel,
} from '../wirings/ai-agent/ai-agent.types.js'

export type AIProviderOptions = Record<string, Record<string, unknown>>

export type AIAgentRunnerParams = {
  model: string
  temperature?: number
  instructions: string
  messages: AIMessage[]
  tools: AIAgentToolDef[]
  maxSteps: number
  toolChoice: 'auto' | 'required' | 'none'
  outputSchema?: Record<string, unknown>
  /** Pikku agent function name — forwarded to the LLM proxy (LiteLLM) as
   *  request-level metadata so usage can be broken down per agent. */
  agentId?: string
}

export type AIAgentRunnerResult = {
  text: string
  object?: unknown
  steps: AIAgentStep[]
  usage: { inputTokens: number; outputTokens: number }
}

export type AIAgentStepResult = {
  text: string
  object?: unknown
  toolCalls: { toolCallId: string; toolName: string; args: unknown }[]
  toolResults: { toolCallId: string; toolName: string; result: unknown }[]
  usage: { inputTokens: number; outputTokens: number }
  finishReason: 'stop' | 'tool-calls' | 'length' | 'error' | 'unknown'
  reasoningContent?: string
}

export type AITranscriptionParams = {
  model: string
  audio: Uint8Array
  providerOptions?: AIProviderOptions
  maxRetries?: number
  abortSignal?: AbortSignal
  headers?: Record<string, string>
}

export type AITranscriptionResult = {
  text: string
  segments?: Array<{
    text: string
    startSecond: number
    endSecond: number
  }>
  language?: string
  durationInSeconds?: number
  warnings?: unknown[]
  providerMetadata?: Record<string, unknown>
  responses?: unknown[]
}

export type AIGenerateSpeechParams = {
  model: string
  text: string
  voice?: string
  outputFormat?: string
  instructions?: string
  speed?: number
  language?: string
  providerOptions?: AIProviderOptions
  maxRetries?: number
  abortSignal?: AbortSignal
  headers?: Record<string, string>
}

export type AIGenerateSpeechResult = {
  audio: {
    uint8Array: Uint8Array
    base64: string
    mediaType: string
    format: string
  }
  warnings?: unknown[]
  providerMetadata?: Record<string, unknown>
  responses?: unknown[]
}

export type AIGenerateImagePrompt =
  | string
  | {
      images: Array<Uint8Array | ArrayBuffer | string>
      text?: string
      mask?: Uint8Array | ArrayBuffer | string
    }

export type AIGenerateImageParams = {
  model: string
  prompt: AIGenerateImagePrompt
  n?: number
  maxImagesPerCall?: number
  size?: `${number}x${number}`
  aspectRatio?: `${number}:${number}`
  seed?: number
  providerOptions?: AIProviderOptions
  maxRetries?: number
  abortSignal?: AbortSignal
  headers?: Record<string, string>
}

export type AIGenerateImageResult = {
  images: Array<{
    uint8Array: Uint8Array
    base64: string
    mediaType: string
  }>
  warnings?: unknown[]
  providerMetadata?: Record<string, unknown>
  responses?: unknown[]
  usage?: {
    inputTokens?: number
    outputTokens?: number
    totalTokens?: number
  }
}

export type AIEmbedParams = {
  model: string
  value: string
  providerOptions?: AIProviderOptions
  maxRetries?: number
  abortSignal?: AbortSignal
  headers?: Record<string, string>
}

export type AIEmbedResult = {
  value: string
  embedding: number[]
  usage?: { tokens?: number }
  warnings?: unknown[]
  providerMetadata?: Record<string, unknown>
  response?: unknown
}

export type AIEmbedManyParams = {
  model: string
  values: string[]
  providerOptions?: AIProviderOptions
  maxRetries?: number
  abortSignal?: AbortSignal
  headers?: Record<string, string>
  maxParallelCalls?: number
}

export type AIEmbedManyResult = {
  values: string[]
  embeddings: number[][]
  usage?: { tokens?: number }
  warnings?: unknown[]
  providerMetadata?: Record<string, unknown>
  responses?: unknown[]
}

export type AIRerankParams<VALUE extends string | Record<string, unknown>> = {
  model: string
  query: string
  documents: VALUE[]
  topK?: number
  providerOptions?: AIProviderOptions
  maxRetries?: number
  abortSignal?: AbortSignal
  headers?: Record<string, string>
}

export type AIRerankResult<VALUE extends string | Record<string, unknown>> = {
  ranking: Array<{
    index: number
    document: VALUE
    score: number
  }>
  rerankedDocuments: VALUE[]
  originalDocuments: VALUE[]
  providerMetadata?: Record<string, unknown>
  response?: unknown
}

export interface AIAgentRunnerService {
  stream(
    params: AIAgentRunnerParams,
    channel: AIStreamChannel
  ): Promise<AIAgentStepResult>
  run(params: AIAgentRunnerParams): Promise<AIAgentStepResult>
  transcribe?(params: AITranscriptionParams): Promise<AITranscriptionResult>
  generateSpeech?(
    params: AIGenerateSpeechParams
  ): Promise<AIGenerateSpeechResult>
  generateImage?(params: AIGenerateImageParams): Promise<AIGenerateImageResult>
  embed?(params: AIEmbedParams): Promise<AIEmbedResult>
  embedMany?(params: AIEmbedManyParams): Promise<AIEmbedManyResult>
  rerank?<VALUE extends string | Record<string, unknown>>(
    params: AIRerankParams<VALUE>
  ): Promise<AIRerankResult<VALUE>>
  /** Return a new runner that uses the given API key for every LLM call.
   *  Optional — runners that don't support per-key scoping leave this undefined. */
  withApiKey?(apiKey: string): AIAgentRunnerService
}
