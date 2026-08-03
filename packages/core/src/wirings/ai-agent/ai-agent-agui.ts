import type { AIStreamChannel, AIStreamEvent } from './ai-agent.types.js'
import { randomUUID } from './ai-agent-utils.js'

type AGUIEvent =
  | { type: 'TEXT_MESSAGE_START'; messageId: string }
  | { type: 'TEXT_MESSAGE_CONTENT'; messageId: string; delta: string }
  | { type: 'TEXT_MESSAGE_END'; messageId: string }
  | { type: 'TOOL_CALL_START'; toolCallId: string; toolCallName: string }
  | { type: 'TOOL_CALL_ARGS'; toolCallId: string; delta: string }
  | { type: 'TOOL_CALL_END'; toolCallId: string; toolCallName: string }
  | {
      type: 'TOOL_CALL_RESULT'
      messageId: string
      toolCallId: string
      role: 'tool'
      content: string
    }
  | { type: 'THINKING_START' }
  | { type: 'THINKING_TEXT_MESSAGE_START'; messageId: string }
  | { type: 'THINKING_TEXT_MESSAGE_CONTENT'; messageId: string; delta: string }
  | { type: 'THINKING_TEXT_MESSAGE_END'; messageId: string }
  | { type: 'THINKING_END' }
  | { type: 'RUN_STARTED'; threadId: string; runId: string }
  | {
      type: 'RUN_FINISHED'
      threadId: string
      runId: string
      model?: string
      usage?: {
        promptTokens: number
        completionTokens: number
        totalTokens: number
      }
    }
  | { type: 'RUN_ERROR'; message: string; code?: string }
  | { type: 'STEP_STARTED'; stepName: string }
  | { type: 'STEP_FINISHED'; stepName: string }
  | { type: 'CUSTOM'; name: string; value: unknown }

export type { AGUIEvent }

export type AGUIChannelOptions = {
  threadId?: string
  runId?: string
  getRunId?: () => string | undefined
}

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

export function wrapChannelWithAGUI(
  inner: AIStreamChannel,
  options?: AGUIChannelOptions
): AIStreamChannel {
  const threadId = options?.threadId ?? randomUUID()
  let runId: string | null = options?.runId ?? null

  function resolveRunId(): string {
    if (!runId) {
      runId = options?.getRunId?.() ?? randomUUID()
    }
    return runId
  }

  let textMessageId: string | null = null
  let thinkingMessageId: string | null = null
  let openStepName: string | null = null
  let stepSeq = 0
  let runStartedSent = false
  let terminal = false
  let sawUsage = false
  let usageModel: string | undefined
  const usageTotals = { input: 0, output: 0 }

  function send(event: AGUIEvent): void {
    if (!runStartedSent) {
      runStartedSent = true
      inner.send({
        type: 'RUN_STARTED',
        threadId,
        runId: resolveRunId(),
      } as unknown as AIStreamEvent)
    }
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
      send({ type: 'THINKING_END' })
      thinkingMessageId = null
    }
  }

  function endStep(): void {
    if (openStepName) {
      send({ type: 'STEP_FINISHED', stepName: openStepName })
      openStepName = null
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
      send({ type: 'THINKING_START' })
      send({
        type: 'THINKING_TEXT_MESSAGE_START',
        messageId: thinkingMessageId,
      })
    }
    return thinkingMessageId
  }

  function finishRun(): void {
    endTextMessage()
    endThinkingMessage()
    endStep()
    send({
      type: 'RUN_FINISHED',
      threadId,
      runId: resolveRunId(),
      ...(usageModel ? { model: usageModel } : {}),
      ...(sawUsage
        ? {
            usage: {
              promptTokens: usageTotals.input,
              completionTokens: usageTotals.output,
              totalTokens: usageTotals.input + usageTotals.output,
            },
          }
        : {}),
    })
    terminal = true
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
    // Delegated: the wrapper is a view over the same connection, so a peer
    // reachable from the channel underneath is reachable from here too.
    remote: (funcName: string, data?: unknown) => inner.remote(funcName, data),
    sendBinary: (data) => inner.sendBinary(data),
    close: () => inner.close(),

    send: (event: AIStreamEvent) => {
      if (terminal) return

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
            type: 'TOOL_CALL_ARGS',
            toolCallId: event.toolCallId,
            delta: resultToString(event.args) || '{}',
          })
          send({
            type: 'TOOL_CALL_END',
            toolCallId: event.toolCallId,
            toolCallName: event.toolName,
          })
          break
        }

        case 'tool-result': {
          send({
            type: 'TOOL_CALL_RESULT',
            messageId: randomUUID(),
            toolCallId: event.toolCallId,
            role: 'tool',
            content: resultToString(event.result),
          })
          break
        }

        case 'usage': {
          endTextMessage()
          endThinkingMessage()
          sawUsage = true
          usageTotals.input += event.tokens.input
          usageTotals.output += event.tokens.output
          if (event.model) usageModel = event.model
          break
        }

        case 'error': {
          endTextMessage()
          endThinkingMessage()
          endStep()
          send({ type: 'RUN_ERROR', message: event.message })
          terminal = true
          break
        }

        case 'done': {
          finishRun()
          break
        }

        case 'step-start': {
          endTextMessage()
          endThinkingMessage()
          endStep()
          stepSeq += 1
          openStepName = `${event.agent ?? 'step'}#${stepSeq}`
          send({ type: 'STEP_STARTED', stepName: openStepName })
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

        case 'interrupted': {
          endTextMessage()
          endThinkingMessage()
          endStep()
          send({
            type: 'CUSTOM',
            name: 'pikku:interrupted',
            value: {
              runId: event.runId,
              text: event.text,
              reason: event.reason,
            },
          })
          break
        }

        // AG-UI has no event for speech, so it travels as CUSTOM like the other
        // pikku-specific ones. Dropping it instead — which is what this did —
        // means a voice agent reached over HTTP is inaudible: `voiceOutput`
        // synthesizes every sentence, the provider bills for it, and nothing
        // gets past the mapper.
        case 'audio-delta': {
          send({
            type: 'CUSTOM',
            name: 'pikku:audio-delta',
            value: {
              data: event.data,
              format: event.format,
              ...(event.text === undefined ? {} : { text: event.text }),
            },
          })
          break
        }

        case 'audio-done': {
          send({ type: 'CUSTOM', name: 'pikku:audio-done', value: {} })
          break
        }

        case 'transcript': {
          send({
            type: 'CUSTOM',
            name: 'pikku:transcript',
            value: { text: event.text },
          })
          break
        }
      }
    },
  }
}
