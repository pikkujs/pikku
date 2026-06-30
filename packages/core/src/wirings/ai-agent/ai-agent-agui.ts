import type { AIStreamChannel, AIStreamEvent } from './ai-agent.types.js'
import { randomUUID } from './ai-agent-utils.js'

type AGUIEvent =
  | { type: 'TEXT_MESSAGE_START'; messageId: string }
  | { type: 'TEXT_MESSAGE_CONTENT'; messageId: string; delta: string }
  | { type: 'TEXT_MESSAGE_END'; messageId: string }
  | { type: 'TOOL_CALL_START'; toolCallId: string; toolCallName: string }
  | {
      type: 'TOOL_CALL_END'
      toolCallId: string
      toolCallName: string
      input: unknown
    }
  | {
      type: 'TOOL_CALL_RESULT'
      toolCallId: string
      role: 'tool'
      content: string
    }
  | { type: 'THINKING_TEXT_MESSAGE_START'; messageId: string }
  | { type: 'THINKING_TEXT_MESSAGE_CONTENT'; messageId: string; delta: string }
  | { type: 'THINKING_TEXT_MESSAGE_END'; messageId: string }
  | { type: 'RUN_STARTED'; threadId?: string; runId?: string }
  | {
      type: 'RUN_FINISHED'
      finishReason?: string
      model?: string
      usage?: {
        promptTokens: number
        completionTokens: number
        totalTokens: number
      }
    }
  | { type: 'RUN_ERROR'; message: string; code?: string }
  | { type: 'STEP_STARTED'; stepName?: string }
  | { type: 'STEP_FINISHED'; stepName?: string }
  | { type: 'CUSTOM'; name: string; value: unknown }

export type { AGUIEvent }

function resultToString(result: unknown): string {
  if (typeof result === 'string') return result
  try {
    return JSON.stringify(result, (_key, val) =>
      typeof val === 'bigint' ? val.toString() : val
    )
  } catch {
    return String(result)
  }
}

export function wrapChannelWithAGUI(inner: AIStreamChannel): AIStreamChannel {
  let textMessageId: string | null = null
  let thinkingMessageId: string | null = null
  let runFinishedSent = false

  function send(event: AGUIEvent): void {
    inner.send(event as unknown as AIStreamEvent)
  }

  function endTextMessage(): void {
    if (textMessageId) {
      send({ type: 'TEXT_MESSAGE_END', messageId: textMessageId })
      textMessageId = null
    }
  }

  function endThinkingMessage(): void {
    if (thinkingMessageId) {
      send({ type: 'THINKING_TEXT_MESSAGE_END', messageId: thinkingMessageId })
      thinkingMessageId = null
    }
  }

  function ensureTextMessage(): string {
    if (!textMessageId) {
      textMessageId = randomUUID()
      send({ type: 'TEXT_MESSAGE_START', messageId: textMessageId })
    }
    return textMessageId
  }

  function ensureThinkingMessage(): string {
    if (!thinkingMessageId) {
      thinkingMessageId = randomUUID()
      send({
        type: 'THINKING_TEXT_MESSAGE_START',
        messageId: thinkingMessageId,
      })
    }
    return thinkingMessageId
  }

  return {
    channelId: inner.channelId,
    openingData: inner.openingData,
    get state() {
      return inner.state
    },
    setState: (s) => inner.setState(s),
    getState: () => inner.getState(),
    clearState: () => inner.clearState(),
    sendBinary: (data) => inner.sendBinary(data),
    close: () => inner.close(),

    send: (event: AIStreamEvent) => {
      switch (event.type) {
        case 'text-delta': {
          endThinkingMessage()
          const id = ensureTextMessage()
          send({
            type: 'TEXT_MESSAGE_CONTENT',
            messageId: id,
            delta: event.text,
          })
          break
        }

        case 'reasoning-delta': {
          endTextMessage()
          const id = ensureThinkingMessage()
          send({
            type: 'THINKING_TEXT_MESSAGE_CONTENT',
            messageId: id,
            delta: event.text,
          })
          break
        }

        case 'tool-call': {
          endTextMessage()
          endThinkingMessage()
          send({
            type: 'TOOL_CALL_START',
            toolCallId: event.toolCallId,
            toolCallName: event.toolName,
          })
          send({
            type: 'TOOL_CALL_END',
            toolCallId: event.toolCallId,
            toolCallName: event.toolName,
            input: event.args,
          })
          break
        }

        case 'tool-result': {
          send({
            type: 'TOOL_CALL_RESULT',
            toolCallId: event.toolCallId,
            role: 'tool',
            content: resultToString(event.result),
          })
          break
        }

        case 'usage': {
          endTextMessage()
          endThinkingMessage()
          if (!runFinishedSent) {
            runFinishedSent = true
            send({
              type: 'RUN_FINISHED',
              model: event.model,
              usage: {
                promptTokens: event.tokens.input,
                completionTokens: event.tokens.output,
                totalTokens: event.tokens.input + event.tokens.output,
              },
            })
          }
          break
        }

        case 'error': {
          endTextMessage()
          endThinkingMessage()
          runFinishedSent = true
          send({ type: 'RUN_ERROR', message: event.message })
          break
        }

        case 'done': {
          endTextMessage()
          endThinkingMessage()
          if (!runFinishedSent) {
            runFinishedSent = true
            send({ type: 'RUN_FINISHED' })
          }
          break
        }

        case 'step-start': {
          send({ type: 'STEP_STARTED', stepName: event.agent })
          break
        }

        case 'approval-request': {
          endTextMessage()
          endThinkingMessage()
          send({
            type: 'CUSTOM',
            name: 'pikku:approval-request',
            value: {
              toolCallId: event.toolCallId,
              toolName: event.toolName,
              args: event.args,
              reason: event.reason,
              runId: event.runId,
              agent: event.agent,
              session: event.session,
            },
          })
          break
        }

        case 'credential-request': {
          endTextMessage()
          endThinkingMessage()
          send({
            type: 'CUSTOM',
            name: 'pikku:credential-request',
            value: {
              toolCallId: event.toolCallId,
              toolName: event.toolName,
              args: event.args,
              credentialName: event.credentialName,
              credentialType: event.credentialType,
              connectUrl: event.connectUrl,
              runId: event.runId,
              agent: event.agent,
              session: event.session,
            },
          })
          break
        }

        case 'generative-ui': {
          send({
            type: 'CUSTOM',
            name: 'pikku:generative-ui',
            value: { spec: event.spec },
          })
          break
        }

        case 'data': {
          send({
            type: 'CUSTOM',
            name: 'pikku:data',
            value: { name: event.name, data: event.data },
          })
          break
        }

        case 'workflow-created': {
          send({
            type: 'CUSTOM',
            name: 'pikku:workflow-created',
            value: { workflowName: event.workflowName, graph: event.graph },
          })
          break
        }

        case 'agent-call': {
          send({
            type: 'CUSTOM',
            name: 'pikku:agent-call',
            value: {
              agentName: event.agentName,
              session: event.session,
              input: event.input,
            },
          })
          break
        }

        case 'agent-result': {
          send({
            type: 'CUSTOM',
            name: 'pikku:agent-result',
            value: {
              agentName: event.agentName,
              session: event.session,
              result: event.result,
            },
          })
          break
        }

        case 'suspended': {
          send({
            type: 'CUSTOM',
            name: 'pikku:suspended',
            value: { reason: event.reason, missingRpcs: event.missingRpcs },
          })
          break
        }

        case 'audio-delta':
        case 'audio-done':
          break
      }
    },
  }
}
