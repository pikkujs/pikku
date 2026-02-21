import { generateText, streamText, tool as aiTool, Output } from 'ai'
import { jsonSchema } from 'ai'
import type {
  AIAgentRunnerService,
  AIAgentRunnerParams,
  AIAgentRunnerResult,
} from '@pikku/core/services'
import type { AIStreamChannel } from '@pikku/core/ai-agent'
import { ToolApprovalRequired } from '@pikku/core/ai-agent'
import {
  convertToSDKMessages,
  convertFromSDKStep,
} from './message-converter.js'

export class VercelAIAgentRunner implements AIAgentRunnerService {
  private providers: Record<string, any>

  constructor(providers: Record<string, any>) {
    this.providers = providers
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

  private getProvider(providerName: string) {
    const provider = this.providers[providerName]
    if (!provider) {
      const available = Object.keys(this.providers).join(', ')
      throw new Error(
        `Unknown AI provider: '${providerName}'. Available: ${available || 'none'}`
      )
    }
    return provider
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
    const provider = this.getProvider(providerName)
    const sdkModel = provider(modelName)
    let approval: ToolApprovalRequired | null = null
    const abortController = new AbortController()
    const aiTools = this.buildTools(params)
    const messages = convertToSDKMessages(params.messages)

    const result = streamText({
      model: sdkModel,
      system: params.instructions,
      messages,
      tools: aiTools,
      maxSteps: params.maxSteps,
      toolChoice: params.toolChoice,
      abortSignal: abortController.signal,
      ...(params.temperature !== undefined && {
        temperature: params.temperature,
      }),
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
        if (approval) break
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
              toolCallId: part.toolCallId,
              toolName: part.toolName,
              args: part.args,
            })
            break
          case 'tool-result':
            if (
              part.result &&
              typeof part.result === 'object' &&
              '__approvalRequired' in (part.result as object)
            ) {
              const r = part.result as unknown as {
                toolName: string
                args: unknown
                reason?: string
              }
              approval = new ToolApprovalRequired(
                part.toolCallId,
                r.toolName,
                r.args,
                r.reason
              )
              abortController.abort()
              break
            }
            channel.send({
              type: 'tool-result',
              toolCallId: part.toolCallId,
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
            if (!approval) {
              channel.send({
                type: 'error',
                message:
                  part.error instanceof Error
                    ? part.error.message
                    : String(part.error),
              })
            }
            break
        }
      }
    } catch {}

    if (approval) {
      throw approval
    }
    channel.send({ type: 'done' })
    channel.close()
  }

  async run(params: AIAgentRunnerParams): Promise<AIAgentRunnerResult> {
    const { provider: providerName, modelName } = this.parseModel(params.model)
    const provider = this.getProvider(providerName)
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
      ...(params.temperature !== undefined && {
        temperature: params.temperature,
      }),
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
