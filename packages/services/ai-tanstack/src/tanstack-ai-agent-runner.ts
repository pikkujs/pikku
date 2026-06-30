import { chat, toolDefinition, maxIterations } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'
import type {
  AIAgentRunnerParams,
  AIAgentRunnerService,
  AIAgentStepResult,
} from '@pikku/core/services'
import type { AIStreamChannel } from '@pikku/core/ai-agent'
import type { AIMessage, AIContentPart } from '@pikku/core/ai-agent'

function parseModel(model: string): { provider: string; modelName: string } {
  const slashIndex = model.indexOf('/')
  if (slashIndex === -1) {
    throw new Error(
      `Invalid model format '${model}'. Expected 'provider/model' (e.g. 'openai/gpt-4o-mini').`
    )
  }
  return {
    provider: model.slice(0, slashIndex),
    modelName: model.slice(slashIndex + 1),
  }
}

function contentToString(
  content: string | AIContentPart[] | undefined | null
): string {
  if (!content) return ''
  if (typeof content === 'string') return content
  return content
    .filter(
      (p): p is Extract<AIContentPart, { type: 'text' }> => p.type === 'text'
    )
    .map((p) => p.text)
    .join('')
}

function contentToStringOrNull(
  content: string | AIContentPart[] | undefined | null
): string | null {
  if (content == null) return null
  if (typeof content === 'string') return content
  const text = content
    .filter(
      (p): p is Extract<AIContentPart, { type: 'text' }> => p.type === 'text'
    )
    .map((p) => p.text)
    .join('')
  return text || null
}

function convertMessages(messages: AIMessage[]): {
  systemPrompts: string[]
  modelMessages: Array<{
    role: 'user' | 'assistant' | 'tool'
    content: string | null
    toolCalls?: Array<{
      id: string
      type: 'function'
      function: { name: string; arguments: string }
    }>
    toolCallId?: string
  }>
} {
  const systemPrompts: string[] = []
  const modelMessages: Array<{
    role: 'user' | 'assistant' | 'tool'
    content: string | null
    toolCalls?: Array<{
      id: string
      type: 'function'
      function: { name: string; arguments: string }
    }>
    toolCallId?: string
  }> = []

  for (const msg of messages) {
    if (msg.role === 'system') {
      const text = contentToString(msg.content)
      if (text) systemPrompts.push(text)
      continue
    }

    if (msg.role === 'user') {
      modelMessages.push({
        role: 'user',
        content: contentToString(msg.content),
      })
      continue
    }

    if (msg.role === 'assistant') {
      const tc = msg.toolCalls?.map((call) => ({
        id: call.id,
        type: 'function' as const,
        function: {
          name: call.name,
          arguments:
            typeof call.args === 'string'
              ? call.args
              : JSON.stringify(call.args),
        },
      }))
      modelMessages.push({
        role: 'assistant',
        content: contentToStringOrNull(msg.content),
        ...(tc?.length ? { toolCalls: tc } : {}),
      })
      continue
    }

    if (msg.role === 'tool' && msg.toolResults) {
      for (const tr of msg.toolResults) {
        modelMessages.push({
          role: 'tool',
          content:
            typeof tr.result === 'string'
              ? tr.result
              : JSON.stringify(tr.result),
          toolCallId: tr.id,
        })
      }
    }
  }

  return { systemPrompts, modelMessages }
}

function buildTools(params: AIAgentRunnerParams) {
  return params.tools.map((t) => {
    if (t.needsApproval) {
      return toolDefinition({
        name: t.name,
        description: t.description,
        inputSchema: t.inputSchema,
        needsApproval: true,
      })
    }
    return toolDefinition({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    }).server(async (input: unknown) => {
      try {
        return await t.execute(input)
      } catch (err: any) {
        if (err?.payload?.error === 'missing_credential') {
          return { __credentialRequired: true, ...err.payload }
        }
        throw err
      }
    })
  })
}

async function runStream(
  params: AIAgentRunnerParams,
  channel: AIStreamChannel | null
): Promise<AIAgentStepResult> {
  const { provider, modelName } = parseModel(params.model)

  if (provider !== 'openai') {
    throw new Error(
      `@pikku/ai-tanstack only supports OpenAI provider. Got: '${provider}'`
    )
  }

  const adapter = openaiText(modelName as any)
  const { systemPrompts, modelMessages } = convertMessages(params.messages)
  const tools = buildTools(params)

  const approvalToolNames = new Set(
    params.tools.filter((t) => t.needsApproval).map((t) => t.name)
  )

  const stepResult: AIAgentStepResult = {
    text: '',
    toolCalls: [],
    toolResults: [],
    usage: { inputTokens: 0, outputTokens: 0 },
    finishReason: 'unknown',
  }

  const firstSeenToolCallIds = new Set<string>()
  const completedFromLLMIds = new Set<string>()
  const toolNameMap = new Map<string, string>()
  const argsBuffer = new Map<string, string>()
  const approvalToolCallIds = new Set<string>()
  const processedApprovalIds = new Set<string>()
  let hasApprovalRequests = false

  const chatStream = chat({
    adapter,
    messages: modelMessages as any,
    systemPrompts: systemPrompts.map((s) => ({ content: s })),
    tools: tools as any,
    agentLoopStrategy: maxIterations(1),
    ...(params.temperature !== undefined
      ? { modelOptions: { temperature: params.temperature } as any }
      : {}),
  })

  for await (const chunk of chatStream as AsyncIterable<any>) {
    const type = chunk.type as string

    if (type === 'TEXT_MESSAGE_CONTENT') {
      const delta: string = chunk.delta ?? ''
      stepResult.text += delta
      channel?.send({ type: 'text-delta', text: delta })
      continue
    }

    if (type === 'TOOL_CALL_START') {
      const id: string = chunk.toolCallId
      if (!firstSeenToolCallIds.has(id)) {
        firstSeenToolCallIds.add(id)
        const name: string = chunk.toolCallName ?? chunk.toolName ?? ''
        toolNameMap.set(id, name)
        argsBuffer.set(id, '')
      }
      continue
    }

    if (type === 'TOOL_CALL_ARGS') {
      const id: string = chunk.toolCallId
      if (firstSeenToolCallIds.has(id) && !completedFromLLMIds.has(id)) {
        argsBuffer.set(id, (argsBuffer.get(id) ?? '') + (chunk.delta ?? ''))
      }
      continue
    }

    if (type === 'TOOL_CALL_END') {
      const id: string = chunk.toolCallId
      if (
        firstSeenToolCallIds.has(id) &&
        !completedFromLLMIds.has(id) &&
        chunk.result === undefined
      ) {
        completedFromLLMIds.add(id)
        const toolName = toolNameMap.get(id) ?? ''
        const argsStr = argsBuffer.get(id) ?? '{}'
        let args: unknown = {}
        try {
          args = JSON.parse(argsStr)
        } catch {}
        stepResult.toolCalls.push({ toolCallId: id, toolName, args })
        channel?.send({ type: 'tool-call', toolCallId: id, toolName, args })
        if (approvalToolNames.has(toolName)) {
          approvalToolCallIds.add(id)
        }
      }
      continue
    }

    if (type === 'TOOL_CALL_RESULT') {
      const id: string = chunk.toolCallId
      const toolName = toolNameMap.get(id) ?? chunk.toolName ?? ''
      const content: string = chunk.content ?? ''
      let result: unknown = content
      try {
        result = JSON.parse(content)
      } catch {}
      stepResult.toolResults.push({ toolCallId: id, toolName, result })
      channel?.send({ type: 'tool-result', toolCallId: id, toolName, result })
      continue
    }

    if (type === 'RUN_FINISHED') {
      if (chunk.usage) {
        stepResult.usage = {
          inputTokens: chunk.usage.promptTokens ?? chunk.usage.inputTokens ?? 0,
          outputTokens:
            chunk.usage.completionTokens ?? chunk.usage.outputTokens ?? 0,
        }
      }
      const fr = chunk.finishReason
      stepResult.finishReason =
        fr === 'tool_calls'
          ? 'tool-calls'
          : fr === 'stop'
            ? 'stop'
            : (fr ?? 'unknown')
      channel?.send({
        type: 'usage',
        tokens: {
          input: stepResult.usage.inputTokens,
          output: stepResult.usage.outputTokens,
        },
        model: modelName,
      })
      break
    }

    if (type === 'RUN_ERROR') {
      const msg: string =
        chunk.message ?? chunk.error?.message ?? 'Unknown error'
      channel?.send({ type: 'error', message: msg })
      stepResult.finishReason = 'error'
      break
    }

    if (type === 'CUSTOM' && chunk.name === 'approval-requested') {
      const id: string = chunk.value?.toolCallId
      if (id) {
        processedApprovalIds.add(id)
      }
      hasApprovalRequests = true
    }

    if (
      hasApprovalRequests &&
      approvalToolCallIds.size > 0 &&
      processedApprovalIds.size >= approvalToolCallIds.size
    ) {
      break
    }
  }

  return stepResult
}

export class TanstackAIAgentRunner implements AIAgentRunnerService {
  async stream(
    params: AIAgentRunnerParams,
    channel: AIStreamChannel
  ): Promise<AIAgentStepResult> {
    return runStream(params, channel)
  }

  async run(params: AIAgentRunnerParams): Promise<AIAgentStepResult> {
    return runStream(params, null)
  }
}
