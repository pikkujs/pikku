import { generateText, streamText, tool as aiTool, Output } from 'ai'
import { jsonSchema } from 'ai'
import type {
  AIAgentRunnerService,
  AIAgentRunnerParams,
  AIAgentRunnerResult,
} from '@pikku/core/services'
import type { AIStreamChannel } from '@pikku/core/ai-agent'
import type { SecretService } from '@pikku/core/services'
import {
  convertToSDKMessages,
  convertFromSDKStep,
} from './message-converter.js'

export class VercelAIAgentRunner implements AIAgentRunnerService {
  private providers: Record<string, any> = {}
  private secretService: SecretService

  constructor(secretService: SecretService, providers?: Record<string, any>) {
    this.secretService = secretService
    if (providers) {
      this.providers = providers
    }
  }

  private parseModel(model: string): { provider: string; modelName: string } {
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

  private async getProvider(providerName: string) {
    if (!this.providers[providerName]) {
      switch (providerName) {
        case 'openai': {
          const { createOpenAI } = await import('@ai-sdk/openai')
          this.providers[providerName] = createOpenAI({
            apiKey: await this.secretService.getSecret('OPENAI_API_KEY'),
          })
          break
        }
        case 'anthropic': {
          const { createAnthropic } = await import('@ai-sdk/anthropic')
          this.providers[providerName] = createAnthropic({
            apiKey: await this.secretService.getSecret('ANTHROPIC_API_KEY'),
          })
          break
        }
        case 'google': {
          const { createGoogleGenerativeAI } = await import('@ai-sdk/google')
          this.providers[providerName] = createGoogleGenerativeAI({
            apiKey: await this.secretService.getSecret('GOOGLE_API_KEY'),
          })
          break
        }
        case 'ollama': {
          const { createOpenAI } = await import('@ai-sdk/openai')
          this.providers[providerName] = createOpenAI({
            baseURL: 'http://localhost:11434/v1',
            apiKey: 'ollama',
          })
          break
        }
        default:
          throw new Error(`Unknown AI provider: ${providerName}`)
      }
    }
    return this.providers[providerName]
  }

  private buildTools(params: AIAgentRunnerParams) {
    return Object.fromEntries(
      params.tools.map((t) => [
        t.name,
        aiTool({
          description: t.description,
          parameters: jsonSchema(t.inputSchema as any),
          execute: async (input: any) => t.execute(input),
        }),
      ])
    )
  }

  async stream(
    params: AIAgentRunnerParams,
    channel: AIStreamChannel
  ): Promise<void> {
    const { provider: providerName, modelName } = this.parseModel(params.model)
    const provider = await this.getProvider(providerName)
    const sdkModel = provider(modelName)
    const aiTools = this.buildTools(params)
    const messages = convertToSDKMessages(params.messages)

    const result = streamText({
      model: sdkModel,
      system: params.instructions,
      messages,
      tools: aiTools,
      maxSteps: params.maxSteps,
      toolChoice: params.toolChoice,
      ...(params.outputSchema
        ? {
            output: Output.object({
              schema: jsonSchema(params.outputSchema as any),
            }),
          }
        : {}),
    })

    try {
      for await (const part of result.fullStream) {
        switch (part.type) {
          case 'text-delta':
            channel.send({ type: 'text-delta', text: part.textDelta })
            break
          case 'reasoning':
            channel.send({ type: 'reasoning-delta', text: part.textDelta })
            break
          case 'tool-call':
            channel.send({
              type: 'tool-call',
              toolName: part.toolName,
              args: part.args,
            })
            break
          case 'tool-result':
            channel.send({
              type: 'tool-result',
              toolName: part.toolName,
              result: part.result,
            })
            break
          case 'step-finish':
            channel.send({
              type: 'usage',
              tokens: {
                input: part.usage.promptTokens,
                output: part.usage.completionTokens,
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
    } catch (err) {
      channel.send({
        type: 'error',
        message: err instanceof Error ? err.message : String(err),
      })
    } finally {
      channel.send({ type: 'done' })
    }
  }

  async run(params: AIAgentRunnerParams): Promise<AIAgentRunnerResult> {
    const { provider: providerName, modelName } = this.parseModel(params.model)
    const provider = await this.getProvider(providerName)
    const sdkModel = provider(modelName)
    const aiTools = this.buildTools(params)
    const messages = convertToSDKMessages(params.messages)

    const result = await generateText({
      model: sdkModel,
      system: params.instructions,
      messages,
      tools: aiTools,
      maxSteps: params.maxSteps,
      toolChoice: params.toolChoice,
      ...(params.outputSchema
        ? {
            output: Output.object({
              schema: jsonSchema(params.outputSchema as any),
            }),
          }
        : {}),
    })

    return {
      text: result.text,
      object: params.outputSchema ? (result as any).output : undefined,
      steps: result.steps.map(convertFromSDKStep),
      usage: {
        inputTokens: result.usage?.promptTokens ?? 0,
        outputTokens: result.usage?.completionTokens ?? 0,
      },
    }
  }
}
