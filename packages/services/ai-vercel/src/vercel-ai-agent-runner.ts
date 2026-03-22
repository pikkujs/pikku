import {
  generateText,
  streamText,
  tool as aiTool,
  Output,
  jsonSchema,
  stepCountIs,
} from 'ai'
import type {
  AIAgentRunnerService,
  AIAgentRunnerParams,
  AIAgentStepResult,
} from '@pikku/core/services'
import type { AIStreamChannel } from '@pikku/core/ai-agent'
import { convertToSDKMessages } from './message-converter.js'

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
        } else if (!prop.type && !prop.anyOf && !prop.oneOf) {
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
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return obj
  const result: any = {}
  for (const [key, value] of Object.entries(obj)) {
    if (value !== null) {
      result[key] = value
    }
  }
  return result
}

export class VercelAIAgentRunner implements AIAgentRunnerService {
  private providers: Record<string, any>

  constructor(providers: Record<string, any>) {
    this.providers = providers
  }

  private parseModel(model: string): { provider: string; modelName: string } {
    if (!model) {
      throw new Error(
        'Model is required but was not provided. This may be a resume call missing the model parameter.'
      )
    }
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
      params.tools.map((t) => {
        const cleaned = cleanSchema(t.inputSchema)
        if (t.needsApproval) {
          return [
            t.name,
            aiTool({
              description: t.description,
              inputSchema: jsonSchema(cleaned),
              needsApproval: true,
            }),
          ]
        }
        return [
          t.name,
          t.needsApproval
            ? aiTool({
                description: t.description,
                inputSchema: jsonSchema(cleaned),
                needsApproval: true,
              })
            : aiTool({
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

  async stream(
    params: AIAgentRunnerParams,
    channel: AIStreamChannel
  ): Promise<AIAgentStepResult> {
    const { provider: providerName, modelName } = this.parseModel(params.model)
    const provider = this.getProvider(providerName)
    const sdkModel = provider(modelName)
    const aiTools = this.buildTools(params)
    const messages = await convertToSDKMessages(params.messages)

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
      stopWhen: stepCountIs(1),
      toolChoice: params.toolChoice,
      ...(params.temperature !== undefined && {
        temperature: params.temperature,
      }),
    })

    try {
      for await (const part of result.fullStream) {
        switch (part.type) {
          case 'text-delta':
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
            const errorText = `Error: ${(part as any).error instanceof Error ? (part as any).error.message : String((part as any).error)}`
            stepResult.toolResults.push({
              toolCallId: (part as any).toolCallId,
              toolName: (part as any).toolName,
              result: errorText,
            })
            channel.send({
              type: 'tool-result',
              toolCallId: (part as any).toolCallId,
              toolName: (part as any).toolName,
              result: errorText,
              isError: true,
            } as any)
            break
          }
          case 'finish-step':
            stepResult.usage = {
              inputTokens: part.usage.inputTokens ?? 0,
              outputTokens: part.usage.outputTokens ?? 0,
            }
            stepResult.finishReason =
              part.finishReason as AIAgentStepResult['finishReason']
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
    } catch (err) {
      console.warn(
        '[VercelAIAgentRunner] Stream error:',
        err instanceof Error ? err.message : String(err)
      )
      throw err
    }

    return stepResult
  }

  async run(params: AIAgentRunnerParams): Promise<AIAgentStepResult> {
    const { provider: providerName, modelName } = this.parseModel(params.model)
    const provider = this.getProvider(providerName)
    const sdkModel = provider(modelName)
    const aiTools = this.buildTools(params)
    const messages = await convertToSDKMessages(params.messages)

    const result = await generateText({
      model: sdkModel,
      system: params.instructions,
      messages,
      tools: aiTools,
      stopWhen: stepCountIs(1),
      toolChoice: params.toolChoice,
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
    })

    const step = result.steps[0]

    const toolCalls =
      step?.toolCalls?.map((tc: any) => ({
        toolCallId: tc.toolCallId,
        toolName: tc.toolName,
        args: tc.input,
      })) ?? []

    const toolResults =
      step?.toolResults?.map((tr: any) => ({
        toolCallId: tr.toolCallId,
        toolName: tr.toolName,
        result: tr.output,
      })) ?? []

    for (const tc of toolCalls) {
      if (!toolResults.find((tr) => tr.toolCallId === tc.toolCallId)) {
        toolResults.push({
          toolCallId: tc.toolCallId,
          toolName: tc.toolName,
          result: `Error: Tool execution failed`,
        })
      }
    }

    return {
      text: result.text,
      object:
        params.outputSchema && params.tools.length === 0
          ? (result as any).output
          : undefined,
      toolCalls,
      toolResults,
      usage: {
        inputTokens: step?.usage?.inputTokens ?? 0,
        outputTokens: step?.usage?.outputTokens ?? 0,
      },
      finishReason:
        (step?.finishReason as AIAgentStepResult['finishReason']) ?? 'unknown',
    }
  }
}
