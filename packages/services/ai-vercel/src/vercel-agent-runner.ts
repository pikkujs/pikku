import {
  embed,
  embedMany,
  experimental_generateSpeech as generateSpeech,
  experimental_transcribe as transcribe,
  generateImage,
  generateText,
  jsonSchema,
  NoTranscriptGeneratedError,
  Output,
  rerank,
  stepCountIs,
  streamText,
  tool as agentTool,
} from 'ai'
import type { SharedV3ProviderOptions } from '@ai-sdk/provider'
import { safeDownload } from './safe-download.js'
import type { AgentStreamChannel } from '@pikku/core/agent'
import type {
  AgentRunnerParams,
  AgentRunnerService,
  AgentStepResult,
} from '@pikku/core/services'
import { resolveModelAlias } from '@pikku/core/agent'
import {
  convertToSDKMessages,
  liftSystemMessages,
} from './message-converter.js'

type AIProviderOptions = Record<string, Record<string, unknown>>
type AITranscriptionParams = {
  model: string
  audio: Uint8Array
  providerOptions?: AIProviderOptions
  maxRetries?: number
  abortSignal?: AbortSignal
  headers?: Record<string, string>
}
type AITranscriptionResult = {
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
type AIGenerateSpeechParams = {
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
type AIGenerateSpeechResult = {
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
type AIGenerateImagePrompt =
  | string
  | {
      images: Array<Uint8Array | ArrayBuffer | string>
      text?: string
      mask?: Uint8Array | ArrayBuffer | string
    }
type AIGenerateImageParams = {
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
type AIGenerateImageResult = {
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
type AIEmbedParams = {
  model: string
  value: string
  providerOptions?: AIProviderOptions
  maxRetries?: number
  abortSignal?: AbortSignal
  headers?: Record<string, string>
}
type AIEmbedResult = {
  value: string
  embedding: number[]
  usage?: { tokens?: number }
  warnings?: unknown[]
  providerMetadata?: Record<string, unknown>
  response?: unknown
}
type AIEmbedManyParams = {
  model: string
  values: string[]
  providerOptions?: AIProviderOptions
  maxRetries?: number
  abortSignal?: AbortSignal
  headers?: Record<string, string>
  maxParallelCalls?: number
}
type AIEmbedManyResult = {
  values: string[]
  embeddings: number[][]
  usage?: { tokens?: number }
  warnings?: unknown[]
  providerMetadata?: Record<string, unknown>
  responses?: unknown[]
}
type AIRerankParams<VALUE extends string | Record<string, unknown>> = {
  model: string
  query: string
  documents: VALUE[]
  topK?: number
  providerOptions?: Record<string, Record<string, unknown>>
  maxRetries?: number
  abortSignal?: AbortSignal
  headers?: Record<string, string>
}
type AIRerankResult<VALUE extends string | Record<string, unknown>> = {
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

function cleanSchema(schema: any): any {
  if (!schema || typeof schema !== 'object') return schema
  const { $schema, ...rest } = schema
  if (rest.type === 'object' && rest.properties) {
    const originalRequired = new Set(rest.required ?? [])
    rest.additionalProperties = false
    for (const key of Object.keys(rest.properties)) {
      rest.properties[key] = cleanSchema(rest.properties[key])
      // OpenAI strict mode requires all properties in `required`.
      // For optional fields, make them nullable so the model can send null
      // instead of inventing placeholder values.
      if (!originalRequired.has(key)) {
        const prop = rest.properties[key]
        if (prop.type && !Array.isArray(prop.type)) {
          prop.type = [prop.type, 'null']
        } else if (Array.isArray(prop.type)) {
          if (!prop.type.includes('null')) prop.type.push('null')
        } else if (prop.anyOf) {
          if (
            !prop.anyOf.some((s: Record<string, unknown>) => s.type === 'null')
          ) {
            prop.anyOf.push({ type: 'null' })
          }
        } else if (prop.oneOf) {
          if (
            !prop.oneOf.some((s: Record<string, unknown>) => s.type === 'null')
          ) {
            prop.oneOf.push({ type: 'null' })
          }
        } else if (!prop.type) {
          prop.anyOf = [{ ...prop }, { type: 'null' }]
        }
      }
    }
    rest.required = Object.keys(rest.properties)
  }
  if (rest.type === 'array' && rest.items) {
    rest.items = cleanSchema(rest.items)
  }
  return rest
}

/**
 * Strip null values from tool call input.
 * LLMs send null for optional fields when the schema uses nullable types,
 * but Zod .optional() expects undefined, not null.
 */
function stripNulls(obj: any): any {
  if (obj === null) return undefined
  if (Array.isArray(obj)) return obj.map(stripNulls)
  if (typeof obj !== 'object') return obj
  const result: any = {}
  for (const [key, value] of Object.entries(obj)) {
    if (value !== null) {
      result[key] = stripNulls(value)
    }
  }
  return result
}

function extractStructuredText(output: unknown): string {
  if (!output || typeof output !== 'object') return ''
  const text = (output as Record<string, unknown>).text
  return typeof text === 'string' ? text : ''
}

function extractStructuredUI(output: unknown): unknown | null {
  if (!output || typeof output !== 'object') return null
  return (output as Record<string, unknown>).ui ?? null
}

type ModelKind =
  'language' | 'embedding' | 'image' | 'transcription' | 'speech' | 'reranking'

const MODEL_METHODS: Record<ModelKind, string[]> = {
  language: ['languageModel'],
  embedding: ['embedding', 'embeddingModel'],
  image: ['image', 'imageModel'],
  transcription: ['transcription', 'transcriptionModel'],
  speech: ['speech', 'speechModel'],
  reranking: ['reranking', 'rerankingModel'],
}

function isCallable(value: unknown): value is (...args: any[]) => any {
  return typeof value === 'function'
}

export class VercelAgentRunner implements AgentRunnerService {
  /** Public + mutable so deploy-time contributors (e.g. fabric's AI Gateway
   *  contributor) can replace providers post-construction with ones that
   *  route through a gateway / inject headers. */
  public providers: Record<string, any>

  private readonly providerFactory?: (apiKey: string) => Record<string, any>

  /** Host allowlist for downloading attachment URLs. When omitted, any
   *  non-private host is permitted; private/internal hosts are always refused. */
  private readonly allowedAttachmentHosts?: string[]

  constructor(
    providers: Record<string, any>,
    providerFactory?: (apiKey: string) => Record<string, any>,
    allowedAttachmentHosts?: string[]
  ) {
    this.providers = providers
    this.providerFactory = providerFactory
    this.allowedAttachmentHosts = allowedAttachmentHosts
  }

  withApiKey(apiKey: string): VercelAgentRunner {
    if (!this.providerFactory) return this
    if (!apiKey?.trim()) return this
    return new VercelAgentRunner(
      this.providerFactory(apiKey),
      this.providerFactory,
      this.allowedAttachmentHosts
    )
  }

  private parseModel(aliasOrModel: string): {
    provider: string
    modelName: string
  } {
    if (!aliasOrModel) {
      throw new Error(
        'Model is required but was not provided. This may be a resume call missing the model parameter.'
      )
    }
    // Every modality resolves aliases here; idempotent for the agent path,
    // which has already been through resolveModelConfig.
    const model = resolveModelAlias(aliasOrModel)
    const slashIndex = model.indexOf('/')
    if (slashIndex === -1) {
      throw new Error(
        `Invalid model format '${model}'. Expected 'provider/model' (e.g. 'openai/gpt-4o', 'ollama/qwen2.5:7b').`
      )
    }
    return {
      provider: model.slice(0, slashIndex),
      modelName: model.slice(slashIndex + 1),
    }
  }

  /**
   * Resolves a provider name to the object that builds models for it.
   *
   * A `'*'` entry catches anything with no exact match. That only makes sense
   * when whatever sits behind it accepts arbitrary model names — a scripted
   * provider, or a gateway — so pointing it at a single real vendor is a
   * mistake: `anthropic/...` reaching OpenAI is not a fallback, it is a bug.
   *
   * Exact entries win, which is what makes "everything through the gateway
   * except this one" expressible as `{ deepinfra: direct, '*': gateway }`.
   */
  private getProvider(providerName: string) {
    const provider = this.providers[providerName] ?? this.providers['*']
    if (!provider) {
      const available = Object.keys(this.providers).join(', ')
      throw new Error(
        `Unknown AI provider: '${providerName}'. Available: ${available || 'none'}`
      )
    }
    return provider
  }

  private getModel(model: string, kind: ModelKind) {
    const { provider: providerName, modelName } = this.parseModel(model)
    const provider = this.getProvider(providerName)

    if (kind === 'language' && isCallable(provider)) {
      return provider(modelName)
    }

    for (const methodName of MODEL_METHODS[kind]) {
      const candidate = provider?.[methodName]
      if (isCallable(candidate)) {
        return candidate.call(provider, modelName)
      }
    }

    throw new Error(
      `Provider '${providerName}' does not support ${kind} models via ${MODEL_METHODS[kind].join(' / ')}`
    )
  }

  private buildTools(params: AgentRunnerParams) {
    return Object.fromEntries(
      params.tools.map((t) => {
        const cleaned = cleanSchema(t.inputSchema)
        if (t.needsApproval) {
          return [
            t.name,
            agentTool({
              description: t.description,
              inputSchema: jsonSchema(cleaned),
              needsApproval: true,
            }),
          ]
        }
        return [
          t.name,
          t.needsApproval
            ? agentTool({
                description: t.description,
                inputSchema: jsonSchema(cleaned),
                needsApproval: true,
              })
            : agentTool({
                description: t.description,
                inputSchema: jsonSchema(cleaned),
                execute: async (input: any) => {
                  try {
                    return await t.execute(stripNulls(input))
                  } catch (err: any) {
                    if (err?.payload?.error === 'missing_credential') {
                      return { __credentialRequired: true, ...err.payload }
                    }
                    throw err
                  }
                },
              }),
        ]
      })
    )
  }

  private buildProviderOptions(
    params: AgentRunnerParams
  ): SharedV3ProviderOptions | undefined {
    const caller = params.providerOptions as SharedV3ProviderOptions | undefined
    if (!params.agentId) return caller
    const meta = { agent_id: params.agentId }
    // Spread into the request body for every provider so LiteLLM picks up
    // agent_id and includes it in the spend-log / generic_api callback.
    const merged: Record<string, Record<string, unknown>> = {
      openai: { metadata: meta },
      anthropic: { metadata: meta },
    }
    // Merged one provider at a time rather than by top-level key: replacing the
    // whole `openai` entry with the caller's would drop `metadata` and quietly
    // end the per-agent billing breakdown, which nothing downstream would
    // notice. Within a provider the caller still wins on every key it sets.
    for (const [provider, options] of Object.entries(caller ?? {})) {
      merged[provider] = { ...merged[provider], ...options }
    }
    // Cast because core types these values as `unknown` and the SDK wants
    // `JSONValue`. Core cannot narrow them without taking a type dependency on
    // the SDK, and the constraint holds anyway: whatever goes in here ends up
    // serialized into a request body, so a non-JSON value was never going to
    // survive the trip regardless of what the type said.
    return merged as SharedV3ProviderOptions
  }

  async stream(
    params: AgentRunnerParams,
    channel: AgentStreamChannel
  ): Promise<AgentStepResult> {
    const sdkModel = this.getModel(params.model, 'language')
    const { modelName } = this.parseModel(params.model)
    const agentTools = this.buildTools(params)
    const { system, messages } = liftSystemMessages(
      await convertToSDKMessages(params.messages),
      params.instructions
    )
    const useStructuredOutput =
      !!params.outputSchema && params.tools.length === 0

    const stepResult: AgentStepResult = {
      text: '',
      toolCalls: [],
      toolResults: [],
      usage: { inputTokens: 0, outputTokens: 0 },
      finishReason: 'unknown',
    }

    const result = streamText({
      model: sdkModel,
      system,
      messages,
      tools: agentTools,
      stopWhen: stepCountIs(1),
      experimental_download: safeDownload(this.allowedAttachmentHosts),
      toolChoice: params.toolChoice,
      abortSignal: params.abortSignal,
      ...(params.temperature !== undefined && {
        temperature: params.temperature,
      }),
      ...(useStructuredOutput
        ? {
            output: Output.object({
              schema: jsonSchema(cleanSchema(params.outputSchema)),
            }),
          }
        : {}),
      providerOptions: this.buildProviderOptions(params),
    })

    try {
      let lastStructuredText = ''
      let lastStructuredUISerialized: string | null = null

      const structuredOutputTask = useStructuredOutput
        ? (async () => {
            for await (const partial of result.partialOutputStream) {
              const nextText = extractStructuredText(partial)
              if (nextText) {
                const delta = nextText.startsWith(lastStructuredText)
                  ? nextText.slice(lastStructuredText.length)
                  : nextText
                stepResult.text = nextText
                if (delta) {
                  channel.send({ type: 'text-delta', text: delta })
                }
                lastStructuredText = nextText
              }

              const nextUI = extractStructuredUI(partial)
              if (nextUI != null) {
                const serialized = JSON.stringify(nextUI)
                if (serialized !== lastStructuredUISerialized) {
                  lastStructuredUISerialized = serialized
                  channel.send({ type: 'generative-ui', spec: nextUI })
                }
              }
            }
          })()
        : null

      for await (const part of result.fullStream) {
        switch (part.type) {
          case 'text-delta':
            if (useStructuredOutput) break
            stepResult.text += part.text
            channel.send({ type: 'text-delta', text: part.text })
            break
          case 'reasoning-delta':
            channel.send({
              type: 'reasoning-delta',
              text: (part as any).delta ?? '',
            })
            break
          case 'tool-call':
            stepResult.toolCalls.push({
              toolCallId: part.toolCallId,
              toolName: part.toolName,
              args: part.input,
            })
            channel.send({
              type: 'tool-call',
              toolCallId: part.toolCallId,
              toolName: part.toolName,
              args: part.input,
            })
            break
          case 'tool-result':
            stepResult.toolResults.push({
              toolCallId: part.toolCallId,
              toolName: part.toolName,
              result: part.output,
            })
            channel.send({
              type: 'tool-result',
              toolCallId: part.toolCallId,
              toolName: part.toolName,
              result: part.output,
            })
            break
          case 'tool-error': {
            const errorMessage =
              (part as any).error instanceof Error
                ? (part as any).error.message
                : String((part as any).error)
            const errorText = `Error: ${errorMessage}`
            stepResult.toolResults.push({
              toolCallId: (part as any).toolCallId,
              toolName: (part as any).toolName,
              result: errorText,
              error: errorMessage,
            })
            channel.send({
              type: 'tool-result',
              toolCallId: (part as any).toolCallId,
              toolName: (part as any).toolName,
              result: errorText,
              error: errorMessage,
            })
            break
          }
          case 'finish-step':
            stepResult.usage = {
              inputTokens: part.usage.inputTokens ?? 0,
              outputTokens: part.usage.outputTokens ?? 0,
            }
            stepResult.finishReason =
              part.finishReason as AgentStepResult['finishReason']
            channel.send({
              type: 'usage',
              tokens: {
                input: part.usage.inputTokens ?? 0,
                output: part.usage.outputTokens ?? 0,
              },
              model: modelName,
            })
            break
          case 'error':
            channel.send({
              type: 'error',
              message:
                part.error instanceof Error
                  ? part.error.message
                  : String(part.error),
            })
            break
        }
      }

      if (structuredOutputTask) {
        await structuredOutputTask
        const finalOutput = await result.output
        stepResult.object = finalOutput
        stepResult.text = extractStructuredText(finalOutput) || stepResult.text
      }
    } catch (err) {
      console.warn(
        '[VercelAgentRunner] Stream error:',
        err instanceof Error ? err.message : String(err)
      )
      throw err
    }

    return stepResult
  }

  async run(params: AgentRunnerParams): Promise<AgentStepResult> {
    const sdkModel = this.getModel(params.model, 'language')
    const agentTools = this.buildTools(params)
    const { system, messages } = liftSystemMessages(
      await convertToSDKMessages(params.messages),
      params.instructions
    )

    const result = await generateText({
      model: sdkModel,
      system,
      messages,
      tools: agentTools,
      stopWhen: stepCountIs(1),
      experimental_download: safeDownload(this.allowedAttachmentHosts),
      toolChoice: params.toolChoice,
      abortSignal: params.abortSignal,
      ...(params.temperature !== undefined && {
        temperature: params.temperature,
      }),
      ...(params.outputSchema && params.tools.length === 0
        ? {
            output: Output.object({
              schema: jsonSchema(cleanSchema(params.outputSchema)),
            }),
          }
        : {}),
      providerOptions: this.buildProviderOptions(params),
    })

    const step = result.steps[0]

    const toolCalls =
      step?.toolCalls?.map((tc: any) => ({
        toolCallId: tc.toolCallId,
        toolName: tc.toolName,
        args: tc.input,
      })) ?? []

    // A tool that threw is absent from `toolResults` entirely and appears in
    // `content` as a `tool-error` part, so the real message is only reachable
    // from there. It goes to `error`, which the run record keeps, and never to
    // `result`, which is replayed to the model: what a tool threw is ours to
    // read, not the model's.
    const toolErrors = new Map<string, string>(
      ((step?.content as any[]) ?? [])
        .filter((part: any) => part?.type === 'tool-error')
        .map((part: any) => [
          part.toolCallId,
          part.error instanceof Error ? part.error.message : String(part.error),
        ])
    )

    const toolResults: AgentStepResult['toolResults'] =
      step?.toolResults?.map((tr: any) => ({
        toolCallId: tr.toolCallId,
        toolName: tr.toolName,
        result: tr.output,
      })) ?? []

    for (const tc of toolCalls) {
      if (!toolResults.find((tr) => tr.toolCallId === tc.toolCallId)) {
        const error = toolErrors.get(tc.toolCallId) ?? 'Tool execution failed'
        toolResults.push({
          toolCallId: tc.toolCallId,
          toolName: tc.toolName,
          result: 'Error: Tool execution failed',
          error,
        })
      }
    }

    const outputObject =
      params.outputSchema && params.tools.length === 0
        ? (result as any).output
        : undefined

    return {
      text: extractStructuredText(outputObject) || result.text,
      object: outputObject,
      toolCalls,
      toolResults,
      usage: {
        inputTokens: step?.usage?.inputTokens ?? 0,
        outputTokens: step?.usage?.outputTokens ?? 0,
      },
      finishReason:
        (step?.finishReason as AgentStepResult['finishReason']) ?? 'unknown',
      reasoningContent:
        (step?.content as any)?.find((p: any) => p.type === 'reasoning')
          ?.text ?? undefined,
    }
  }

  /**
   * Silence is an outcome, not a failure.
   *
   * The AI SDK throws `AI_NoTranscriptGeneratedError` whenever a model returns
   * empty text, which is reasonable for a one-shot transcription job and wrong
   * for a conversation: a turn where the user said nothing is the single most
   * ordinary thing that can happen at a microphone, and it arrives here every
   * time a silence detector fires on a pause. Callers get `text: ''` and decide
   * — which is what they already do for a transcript that comes back blank by
   * any other route.
   *
   * Only that one error is caught. A missing key, a refused request or an
   * unreachable provider still throw.
   */
  async transcribe(
    params: AITranscriptionParams
  ): Promise<AITranscriptionResult> {
    let result: Awaited<ReturnType<typeof transcribe>>
    try {
      result = await transcribe({
        model: this.getModel(params.model, 'transcription'),
        audio: params.audio,
        providerOptions: params.providerOptions as any,
        maxRetries: params.maxRetries,
        abortSignal: params.abortSignal,
        headers: params.headers,
      })
    } catch (error) {
      if (NoTranscriptGeneratedError.isInstance(error)) {
        return {
          text: '',
          segments: [],
          warnings: [],
          responses: error.responses,
        }
      }
      throw error
    }

    return {
      text: result.text,
      segments: result.segments,
      language: result.language,
      durationInSeconds: result.durationInSeconds,
      warnings: result.warnings,
      providerMetadata: result.providerMetadata,
      responses: result.responses,
    }
  }

  async generateSpeech(
    params: AIGenerateSpeechParams
  ): Promise<AIGenerateSpeechResult> {
    const result = await generateSpeech({
      model: this.getModel(params.model, 'speech'),
      text: params.text,
      voice: params.voice,
      outputFormat: params.outputFormat,
      instructions: params.instructions,
      speed: params.speed,
      language: params.language,
      providerOptions: params.providerOptions as any,
      maxRetries: params.maxRetries,
      abortSignal: params.abortSignal,
      headers: params.headers,
    })

    return {
      audio: {
        uint8Array: result.audio.uint8Array,
        base64: result.audio.base64,
        mediaType: result.audio.mediaType,
        format: result.audio.format,
      },
      warnings: result.warnings,
      providerMetadata: result.providerMetadata,
      responses: result.responses,
    }
  }

  async generateImage(
    params: AIGenerateImageParams
  ): Promise<AIGenerateImageResult> {
    const result = await generateImage({
      model: this.getModel(params.model, 'image'),
      prompt: params.prompt as any,
      n: params.n,
      maxImagesPerCall: params.maxImagesPerCall,
      size: params.size,
      aspectRatio: params.aspectRatio,
      seed: params.seed,
      providerOptions: params.providerOptions as any,
      maxRetries: params.maxRetries,
      abortSignal: params.abortSignal,
      headers: params.headers,
    })

    return {
      images: result.images.map((image) => ({
        uint8Array: image.uint8Array,
        base64: image.base64,
        mediaType: image.mediaType,
      })),
      warnings: result.warnings,
      providerMetadata: result.providerMetadata,
      responses: result.responses,
      usage: result.usage,
    }
  }

  async embed(params: AIEmbedParams): Promise<AIEmbedResult> {
    const result = await embed({
      model: this.getModel(params.model, 'embedding'),
      value: params.value,
      providerOptions: params.providerOptions as any,
      maxRetries: params.maxRetries,
      abortSignal: params.abortSignal,
      headers: params.headers,
    })

    return {
      value: result.value,
      embedding: result.embedding as number[],
      usage: result.usage,
      warnings: result.warnings,
      providerMetadata: result.providerMetadata,
      response: result.response,
    }
  }

  async embedMany(params: AIEmbedManyParams): Promise<AIEmbedManyResult> {
    const result = await embedMany({
      model: this.getModel(params.model, 'embedding'),
      values: params.values,
      providerOptions: params.providerOptions as any,
      maxRetries: params.maxRetries,
      abortSignal: params.abortSignal,
      headers: params.headers,
      maxParallelCalls: params.maxParallelCalls,
    })

    return {
      values: result.values,
      embeddings: result.embeddings as number[][],
      usage: result.usage,
      warnings: result.warnings,
      providerMetadata: result.providerMetadata,
      responses: result.responses,
    }
  }

  async rerank<VALUE extends string | Record<string, unknown>>(
    params: AIRerankParams<VALUE>
  ): Promise<AIRerankResult<VALUE>> {
    const result = await rerank({
      model: this.getModel(params.model, 'reranking'),
      query: params.query,
      documents: params.documents as any,
      topN: params.topK,
      providerOptions: params.providerOptions as any,
      maxRetries: params.maxRetries,
      abortSignal: params.abortSignal,
      headers: params.headers,
    })

    return {
      ranking: result.ranking.map((entry) => ({
        index: entry.originalIndex,
        document: entry.document as VALUE,
        score: entry.score,
      })),
      rerankedDocuments: result.rerankedDocuments as VALUE[],
      originalDocuments: result.originalDocuments as VALUE[],
      providerMetadata: result.providerMetadata,
      response: result.response,
    }
  }
}
