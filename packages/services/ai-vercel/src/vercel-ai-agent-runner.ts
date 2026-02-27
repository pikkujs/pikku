import { generateText, streamText, tool as aiTool, Output } from 'ai'
import { jsonSchema } from 'ai'
import type {
  AIAgentRunnerService,
  AIAgentRunnerParams,
  AIAgentStepResult,
} from '@pikku/core/services'
import type { AIStreamChannel } from '@pikku/core/ai-agent'
import { convertToSDKMessages } from './message-converter.js'

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
        t.needsApproval
          ? aiTool({
              description: t.description,
              parameters: jsonSchema(t.inputSchema as any),
            })
          : aiTool({
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
  ): Promise<AIAgentStepResult> {
    const { provider: providerName, modelName } = this.parseModel(params.model)
    const provider = this.getProvider(providerName)
    const sdkModel = provider(modelName)
    const aiTools = this.buildTools(params)
    const messages = convertToSDKMessages(params.messages)

    const stepResult: AIAgentStepResult = {
      text: '',
      toolCalls: [],
      toolResults: [],
      usage: { inputTokens: 0, outputTokens: 0 },
      finishReason: 'unknown',
    }

    const result = streamText({
      model: sdkModel,
      system: params.instructions,
      messages,
      tools: aiTools,
      maxSteps: 1,
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

    try {
      for await (const part of result.fullStream) {
        switch (part.type) {
          case 'text-delta':
            stepResult.text += part.textDelta
            channel.send({ type: 'text-delta', text: part.textDelta })
            break
          case 'reasoning':
            channel.send({ type: 'reasoning-delta', text: part.textDelta })
            break
          case 'tool-call':
            stepResult.toolCalls.push({
              toolCallId: part.toolCallId,
              toolName: part.toolName,
              args: part.args,
            })
            channel.send({
              type: 'tool-call',
              toolCallId: part.toolCallId,
              toolName: part.toolName,
              args: part.args,
            })
            break
          case 'tool-result':
            stepResult.toolResults.push({
              toolCallId: part.toolCallId,
              toolName: part.toolName,
              result: part.result,
            })
            channel.send({
              type: 'tool-result',
              toolCallId: part.toolCallId,
              toolName: part.toolName,
              result: part.result,
            })
            break
          case 'step-finish':
            stepResult.usage = {
              inputTokens: part.usage.promptTokens,
              outputTokens: part.usage.completionTokens,
            }
            stepResult.finishReason =
              part.finishReason as AIAgentStepResult['finishReason']
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
    } catch {}

    if (params.outputSchema) {
      try {
        const awaited = await result
        stepResult.object = (awaited as any).output
      } catch {}
    }

    return stepResult
  }

  async run(params: AIAgentRunnerParams): Promise<AIAgentStepResult> {
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
      maxSteps: 1,
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

    const step = result.steps[0]

    return {
      text: result.text,
      object: params.outputSchema ? (result as any).output : undefined,
      toolCalls:
        step?.toolCalls?.map((tc: any) => ({
          toolCallId: tc.toolCallId,
          toolName: tc.toolName,
          args: tc.args,
        })) ?? [],
      toolResults:
        step?.toolResults?.map((tr: any) => ({
          toolCallId: tr.toolCallId,
          toolName: tr.toolName,
          result: tr.result,
        })) ?? [],
      usage: {
        inputTokens: step?.usage?.promptTokens ?? 0,
        outputTokens: step?.usage?.completionTokens ?? 0,
      },
      finishReason:
        (step?.finishReason as AIAgentStepResult['finishReason']) ?? 'unknown',
    }
  }
}
