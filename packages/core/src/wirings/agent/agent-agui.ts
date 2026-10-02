import type { AgentStreamChannel, AgentStreamEvent } from './agent.types.js'
import { randomUUID } from './agent-utils.js'

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
  inner: AgentStreamChannel,
  options?: AGUIChannelOptions
): AgentStreamChannel {
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

  async function send(event: AGUIEvent): Promise<void> {
    if (!runStartedSent) {
      runStartedSent = true
      await inner.send({
        type: 'RUN_STARTED',
        threadId,
        runId: resolveRunId(),
      } as unknown as AgentStreamEvent)
    }
    await inner.send(event as unknown as AgentStreamEvent)
  }

  async function endTextMessage(): Promise<void> {
    if (textMessageId) {
      await send({ type: 'TEXT_MESSAGE_END', messageId: textMessageId })
      textMessageId = null
    }
  }

  async function endThinkingMessage(): Promise<void> {
    if (thinkingMessageId) {
      await send({
        type: 'THINKING_TEXT_MESSAGE_END',
        messageId: thinkingMessageId,
      })
      await send({ type: 'THINKING_END' })
      thinkingMessageId = null
    }
  }

  async function endStep(): Promise<void> {
    if (openStepName) {
      await send({ type: 'STEP_FINISHED', stepName: openStepName })
      openStepName = null
    }
  }

  async function ensureTextMessage(): Promise<string> {
    if (!textMessageId) {
      textMessageId = randomUUID()
      await send({ type: 'TEXT_MESSAGE_START', messageId: textMessageId })
    }
    return textMessageId
  }

  async function ensureThinkingMessage(): Promise<string> {
    if (!thinkingMessageId) {
      thinkingMessageId = randomUUID()
      await send({ type: 'THINKING_START' })
      await send({
        type: 'THINKING_TEXT_MESSAGE_START',
        messageId: thinkingMessageId,
      })
    }
    return thinkingMessageId
  }

  async function finishRun(): Promise<void> {
    await endTextMessage()
    await endThinkingMessage()
    await endStep()
    await send({
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

    send: async (event: AgentStreamEvent) => {
      if (terminal) return

      switch (event.type) {
        case 'text-delta': {
          await endThinkingMessage()
          const id = await ensureTextMessage()
          await send({
            type: 'TEXT_MESSAGE_CONTENT',
            messageId: id,
            delta: event.text,
          })
          break
        }

        case 'reasoning-delta': {
          await endTextMessage()
          const id = await ensureThinkingMessage()
          await send({
            type: 'THINKING_TEXT_MESSAGE_CONTENT',
            messageId: id,
            delta: event.text,
          })
          break
        }

        case 'tool-call': {
          await endTextMessage()
          await endThinkingMessage()
          await send({
            type: 'TOOL_CALL_START',
            toolCallId: event.toolCallId,
            toolCallName: event.toolName,
          })
          await send({
            type: 'TOOL_CALL_ARGS',
            toolCallId: event.toolCallId,
            delta: resultToString(event.args) || '{}',
          })
          await send({
            type: 'TOOL_CALL_END',
            toolCallId: event.toolCallId,
            toolCallName: event.toolName,
          })
          break
        }

        case 'tool-result': {
          await send({
            type: 'TOOL_CALL_RESULT',
            messageId: randomUUID(),
            toolCallId: event.toolCallId,
            role: 'tool',
            content: resultToString(event.result),
          })
          break
        }

        case 'usage': {
          await endTextMessage()
          await endThinkingMessage()
          sawUsage = true
          usageTotals.input += event.tokens.input
          usageTotals.output += event.tokens.output
          if (event.model) usageModel = event.model
          break
        }

        case 'error': {
          await endTextMessage()
          await endThinkingMessage()
          await endStep()
          await send({ type: 'RUN_ERROR', message: event.message })
          terminal = true
          break
        }

        case 'done': {
          await finishRun()
          break
        }

        case 'step-start': {
          await endTextMessage()
          await endThinkingMessage()
          await endStep()
          stepSeq += 1
          openStepName = `${event.agent ?? 'step'}#${stepSeq}`
          await send({ type: 'STEP_STARTED', stepName: openStepName })
          break
        }

        case 'approval-request': {
          await endTextMessage()
          await endThinkingMessage()
          await send({
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
          await endTextMessage()
          await endThinkingMessage()
          await send({
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
          await send({
            type: 'CUSTOM',
            name: 'pikku:generative-ui',
            value: { spec: event.spec },
          })
          break
        }

        case 'data': {
          await send({
            type: 'CUSTOM',
            name: 'pikku:data',
            value: { name: event.name, data: event.data },
          })
          break
        }

        case 'agent-call': {
          await send({
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
          await send({
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
          await send({
            type: 'CUSTOM',
            name: 'pikku:suspended',
            value: { reason: event.reason, missingRpcs: event.missingRpcs },
          })
          break
        }

        case 'interrupted': {
          await endTextMessage()
          await endThinkingMessage()
          await endStep()
          await send({
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

        // knowledge: decisions/internals/agent-speech-travels-as-a-custom-agui-event.md
        case 'audio-delta': {
          await send({
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
          await send({ type: 'CUSTOM', name: 'pikku:audio-done', value: {} })
          break
        }

        case 'transcript': {
          await send({
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
