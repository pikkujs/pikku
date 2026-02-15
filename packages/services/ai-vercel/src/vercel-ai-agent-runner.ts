import { generateText, tool as aiTool, Output } from 'ai'
import { jsonSchema } from 'ai'
import type { AIAgentRunnerService } from '@pikku/core/services'
import type {
  AIMessage,
  AIAgentStep,
  AIAgentModelConfig,
  AIAgentToolDef,
} from '@pikku/core/ai-agent'
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

  private async getProvider(modelConfig: AIAgentModelConfig) {
    const providerName = modelConfig.provider
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
            baseURL:
              (modelConfig as any).baseURL || 'http://localhost:11434/v1',
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

  async run(params: {
    model: AIAgentModelConfig
    instructions: string
    messages: AIMessage[]
    tools: AIAgentToolDef[]
    maxSteps: number
    toolChoice: 'auto' | 'required' | 'none'
    outputSchema?: Record<string, unknown>
    onStepFinish?: (step: AIAgentStep) => void
  }): Promise<{
    text: string
    object?: unknown
    steps: AIAgentStep[]
    usage: { inputTokens: number; outputTokens: number }
  }> {
    const { model: modelName } = params.model

    const provider = await this.getProvider(params.model)
    const sdkModel = provider(modelName)

    const aiTools = Object.fromEntries(
      params.tools.map((t) => [
        t.name,
        aiTool({
          description: t.description,
          parameters: jsonSchema(t.inputSchema as any),
          execute: async (input: any) => t.execute(input),
        }),
      ])
    )

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
            experimental_output: Output.object({
              schema: jsonSchema(params.outputSchema as any),
            }),
          }
        : {}),
      onStepFinish: params.onStepFinish
        ? (step: any) => params.onStepFinish!(convertFromSDKStep(step))
        : undefined,
    })

    return {
      text: result.text,
      object: params.outputSchema
        ? (result as any).experimental_output
        : undefined,
      steps: result.steps.map(convertFromSDKStep),
      usage: {
        inputTokens: result.usage?.promptTokens ?? 0,
        outputTokens: result.usage?.completionTokens ?? 0,
      },
    }
  }
}
