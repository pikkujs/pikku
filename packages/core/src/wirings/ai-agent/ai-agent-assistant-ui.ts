import type {
  AIStreamChannel,
  AIStreamEvent,
  AIAgentInput,
} from './ai-agent.types.js'
import { randomUUID } from 'crypto'

type AssistantUIChunk =
  | { type: 'start'; messageId: string }
  | { type: 'text-delta'; textDelta: string }
  | { type: 'reasoning-delta'; delta: string }
  | {
      type: 'tool-call-start'
      id: string
      toolCallId: string
      toolName: string
    }
  | {
      type: 'tool-call-delta'
      argsText: string
    }
  | { type: 'tool-call-end' }
  | {
      type: 'tool-result'
      toolCallId: string
      result: unknown
    }
  | {
      type: 'finish-step'
      finishReason: string
      usage?: { promptTokens: number; completionTokens: number }
      isContinued: boolean
    }
  | {
      type: 'finish'
      finishReason: string
      usage?: { promptTokens: number; completionTokens: number }
    }
  | { type: 'error'; errorText: string }
  | { type: string; data: unknown }

export function createAssistantUIChannel(
  parent: AIStreamChannel
): AIStreamChannel {
  const messageId = randomUUID()
  let started = false
  let totalInputTokens = 0
  let totalOutputTokens = 0
  let pendingToolResults: AssistantUIChunk[] = []
  let hasToolCalls = false
  let hasPendingApproval = false

  const sendChunk = (chunk: AssistantUIChunk) => {
    parent.send(chunk as any)
  }

  const ensureStarted = () => {
    if (!started) {
      started = true
      sendChunk({ type: 'start', messageId })
    }
  }

  const flushToolResults = () => {
    for (const chunk of pendingToolResults) {
      sendChunk(chunk)
    }
    pendingToolResults = []
  }

  return {
    channelId: parent.channelId,
    openingData: parent.openingData,
    get state() {
      return parent.state
    },
    close: () => parent.close(),
    send: (event: AIStreamEvent) => {
      switch (event.type) {
        case 'text-delta':
          ensureStarted()
          sendChunk({ type: 'text-delta', textDelta: event.text })
          break

        case 'reasoning-delta':
          ensureStarted()
          sendChunk({ type: 'reasoning-delta', delta: event.text })
          break

        case 'tool-call':
          ensureStarted()
          hasToolCalls = true
          sendChunk({
            type: 'tool-call-start',
            id: event.toolCallId,
            toolCallId: event.toolCallId,
            toolName: event.toolName,
          })
          sendChunk({
            type: 'tool-call-delta',
            argsText:
              typeof event.args === 'string'
                ? event.args
                : JSON.stringify(event.args),
          })
          sendChunk({ type: 'tool-call-end' })
          break

        case 'tool-result':
          ensureStarted()
          pendingToolResults.push({
            type: 'tool-result',
            toolCallId: event.toolCallId,
            result: event.result,
          })
          break

        case 'agent-call':
        case 'agent-result':
          break

        case 'usage': {
          ensureStarted()
          totalInputTokens += event.tokens.input
          totalOutputTokens += event.tokens.output
          const hasPending = pendingToolResults.length > 0
          sendChunk({
            type: 'finish-step',
            finishReason: hasToolCalls ? 'tool-calls' : 'stop',
            usage: {
              promptTokens: event.tokens.input,
              completionTokens: event.tokens.output,
            },
            isContinued: hasPending,
          })
          flushToolResults()
          hasToolCalls = false
          break
        }

        case 'error':
          ensureStarted()
          sendChunk({ type: 'error', errorText: event.message })
          break

        case 'approval-request':
          ensureStarted()
          hasPendingApproval = true
          sendChunk({ type: 'data-approval-request', data: event })
          break

        case 'suspended':
          ensureStarted()
          sendChunk({ type: 'data-suspended', data: event })
          break

        case 'done':
          ensureStarted()
          flushToolResults()
          sendChunk({
            type: 'finish',
            finishReason: hasPendingApproval ? 'tool-calls' : 'stop',
            usage: {
              promptTokens: totalInputTokens,
              completionTokens: totalOutputTokens,
            },
          })
          parent.send('[DONE]' as any)
          parent.close()
          break
      }
    },
  }
}

export function parseAssistantUIInput(
  input: Record<string, unknown>,
  defaults?: { resourceId?: string }
): AIAgentInput {
  const messages = input.messages as Array<Record<string, unknown>> | undefined
  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    throw new Error(
      'assistant-ui input must contain a non-empty messages array'
    )
  }

  const lastUserMessage = [...messages].reverse().find((m) => m.role === 'user')
  if (!lastUserMessage) {
    throw new Error('No user message found in assistant-ui input')
  }

  let messageText: string
  if (typeof lastUserMessage.content === 'string') {
    messageText = lastUserMessage.content
  } else if (Array.isArray(lastUserMessage.parts)) {
    const textPart = (
      lastUserMessage.parts as Array<Record<string, unknown>>
    ).find((p) => p.type === 'text')
    messageText = textPart ? String(textPart.text) : ''
  } else if (Array.isArray(lastUserMessage.content)) {
    const textPart = (
      lastUserMessage.content as Array<Record<string, unknown>>
    ).find((p) => p.type === 'text')
    messageText = textPart ? String(textPart.text) : ''
  } else {
    messageText = ''
  }

  const threadId =
    (input.threadId as string) ?? (input.id as string) ?? randomUUID()
  const resourceId = defaults?.resourceId ?? 'default'

  return { message: messageText, threadId, resourceId }
}
