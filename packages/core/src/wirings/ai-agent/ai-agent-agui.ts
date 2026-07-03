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
  const runId = options?.runId ?? randomUUID()

  let textMessageId: string | null = null
  let thinkingMessageId: string | null = null
  let openStepName: string | null = null
  let stepSeq = 0
  let runStartedSent = false
  let terminal = false
  let sawUsage = false
  let usageModel: string | undefined
  const usageTotals = { input: 0, output: 0 }

  // The AG-UI client rejects any event arriving before RUN_STARTED, so the
  // run is opened lazily with the first translated event.
  function send(event: AGUIEvent): void {
    if (!runStartedSent) {
      runStartedSent = true
      inner.send({
        type: 'RUN_STARTED',
        threadId,
        runId,
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

  // The AG-UI client treats RUN_FINISHED as terminal and rejects everything
  // after it, so it is emitted exactly once — on 'done' — with the usage
  // accumulated across all steps (per-step 'usage' events must NOT finish
  // the run: on multi-step tool runs later steps would arrive after
  // RUN_FINISHED and the client would drop the whole stream).
  function finishRun(): void {
    endTextMessage()
    endThinkingMessage()
    endStep()
    send({
      type: 'RUN_FINISHED',
      threadId,
      runId,
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

        // Step names must be unique among active steps on the client and
        // sub-agents reuse step numbers on the shared channel, so each
        // step-start closes the previous step and gets a sequential name.
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
