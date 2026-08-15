import type {
  AgentStreamChannel,
  AgentStreamEvent,
  AgentStep,
  AgentMessage,
  AgentToolCall,
  AgentToolResult,
  PikkuAgentMiddlewareHooks,
  AgentRunState,
  CoreAgent,
  AgentMemoryConfig,
} from './agent.types.js'
import { finalizeAgentRun, lastUserMessageText } from './agent-finalize.js'
import { pikkuState, getSingletonServices } from '../../pikku-state.js'
import { applyInputMiddleware } from './agent-turn.js'
import { AIProviderNotConfiguredError } from '../../errors/errors.js'
import { deniedToolResult, randomUUID } from './agent-utils.js'
import { SPOKEN_TRANSCRIPT } from './voice-input.js'
import {
  combineChannelMiddleware,
  wrapChannelWithMiddleware,
} from '../channel/channel-middleware-runner.js'
import type { AgentStorageService } from '../../services/agent-storage-service.js'
import type {
  AgentRunnerParams,
  AgentStepResult,
} from '../../services/agent-runner-service.js'

import {
  resolveMemoryServices,
  loadContextMessages,
  trimMessages,
  getWorkingMemoryMiddleware,
} from './agent-memory.js'
import {
  prepareAgentRun,
  resolveAgent,
  buildInstructions,
  buildToolDefs,
  createScopedChannel,
  resolveOwnerResourceId,
  agentSessionScope,
  assertResourceOwner,
  assertResourcePrincipalOwner,
  assertAgentAuthorized,
  ToolApprovalRequired,
  ToolCredentialRequired,
  APPROVAL_REQUIRED,
  CREDENTIAL_REQUIRED,
  type RunAgentParams,
  type StreamAgentOptions,
  type StreamContext,
} from './agent-prepare.js'
import { resolveModelConfig } from './agent-model-config.js'
import type { AgentRunStateService } from '../../services/agent-run-state-service.js'
import type { AgentRunnerService } from '../../services/agent-runner-service.js'
import {
  getInFlightTools,
  isAbortError,
  persistOrphanedToolResults,
  registerInterruptibleRun,
  signalRunInterrupt,
  trackInterruptNote,
  trackToolExecution,
  type AgentInterruption,
  type AgentInterruptResult,
} from './agent-interrupt.js'

type PersistingChannel = AgentStreamChannel & {
  fullText: string
  flush: (opts?: { interrupted?: boolean }) => Promise<void>
  totalUsage: { inputTokens: number; outputTokens: number; model?: string }
  /** Every tool the run called, kept for the whole run rather than per step. */
  runToolCalls: NonNullable<AgentStep['toolCalls']>
}

function createPersistingChannel(
  parent: AgentStreamChannel,
  storage: AgentStorageService | undefined,
  threadId: string,
  logger?: { error: (...args: any[]) => void }
): PersistingChannel {
  let fullText = ''
  let stepText = ''
  let stepGenerativeUI: unknown | null = null
  let stepToolCalls: AgentToolCall[] = []
  let stepToolResults: AgentToolResult[] = []
  const totalUsage: {
    inputTokens: number
    outputTokens: number
    model?: string
  } = {
    inputTokens: 0,
    outputTokens: 0,
  }
  // Survives the per-step flush below, which clears its own buffers: the run
  // record needs every call the run made, not just the last step's.
  const runToolCalls: NonNullable<AgentStep['toolCalls']> = []

  const flushStep = async (opts?: { interrupted?: boolean }) => {
    if (!storage) return
    const text = stepText
    const generativeUI = stepGenerativeUI
    const calls = stepToolCalls
    const results = stepToolResults
    stepText = ''
    stepGenerativeUI = null
    stepToolCalls = []
    stepToolResults = []
    if (text || generativeUI != null || calls.length > 0) {
      const assistantMsg: AgentMessage = {
        id: randomUUID(),
        role: 'assistant',
        content:
          generativeUI != null
            ? [
                ...(text ? [{ type: 'text' as const, text }] : []),
                { type: 'generative-ui' as const, spec: generativeUI },
              ]
            : text || undefined,
        toolCalls: calls.length > 0 ? calls : undefined,
        ...(opts?.interrupted ? { interrupted: true } : {}),
        createdAt: new Date(),
      }
      const messages: AgentMessage[] = [assistantMsg]
      if (results.length > 0) {
        messages.push({
          id: randomUUID(),
          role: 'tool',
          toolResults: results,
          createdAt: new Date(),
        })
      }
      await storage.saveMessages(threadId, messages)
    }
  }

  const flushDetached = () => {
    void flushStep().catch((error) => {
      logger?.error('Failed to persist agent messages', {
        threadId,
        error,
      })
    })
  }

  const runToolCallIndex = new Map<string, number>()

  const channel: PersistingChannel = {
    channelId: parent.channelId,
    openingData: parent.openingData,
    get state() {
      return parent.state
    },
    get fullText() {
      return fullText
    },
    get totalUsage() {
      return totalUsage
    },
    get runToolCalls() {
      return runToolCalls
    },
    flush: flushStep,
    close: () => parent.close(),
    sendBinary: (data) => parent.sendBinary(data),
    send: (event: AgentStreamEvent) => {
      // Accumulated whether or not storage is configured: `fullText` is what
      // the client was streamed, and an interrupted run has to be able to
      // report the fragment it got through even with persistence turned off.
      if (event.type === 'text-delta') fullText += event.text
      if (event.type === 'tool-call') {
        runToolCallIndex.set(event.toolCallId, runToolCalls.length)
        runToolCalls.push({
          name: event.toolName,
          args: event.args as Record<string, unknown>,
          result: '',
        })
      }
      if (event.type === 'tool-result') {
        const index = runToolCallIndex.get(event.toolCallId)
        const result =
          typeof event.result === 'string'
            ? event.result
            : JSON.stringify(event.result)
        const call = index === undefined ? undefined : runToolCalls[index]
        if (call) {
          call.result = result
          if (event.error) call.error = event.error
        }
      }
      if (storage) {
        switch (event.type) {
          case 'text-delta':
            stepText += event.text
            break
          case 'tool-call':
            stepToolCalls.push({
              id: event.toolCallId,
              name: event.toolName,
              args: event.args as Record<string, unknown>,
            })
            break
          case 'tool-result':
            stepToolResults.push({
              id: event.toolCallId,
              name: event.toolName,
              result:
                typeof event.result === 'string'
                  ? event.result
                  : JSON.stringify(event.result),
              ...(event.error ? { error: event.error } : {}),
            })
            break
          case 'generative-ui':
            stepGenerativeUI = event.spec
            break
          case 'usage':
            totalUsage.inputTokens += event.tokens.input
            totalUsage.outputTokens += event.tokens.output
            if (event.model) totalUsage.model = event.model
            flushDetached()
            break
          case 'done':
            flushDetached()
            break
        }
      }
      parent.send(event)
    },
    setState: (s) => parent.setState(s),
    getState: () => parent.getState(),
    clearState: () => parent.clearState(),
    remote: (funcName: string, data?: unknown) => parent.remote(funcName, data),
  }
  return channel
}

/**
 * Agents already warned about, so a per-request hook does not become a
 * per-request log line.
 */
const warnedUnstreamedOutputHooks = new Set<string>()

/**
 * `modifyOutput` does not run on a streamed run at all. Nothing here could act
 * on what it returns — the text has already reached the client, and
 * `createPersistingChannel` flushes each step to storage as it goes, so by the
 * time the run ends the transcript is already written.
 *
 * Rewriting on this path belongs to `modifyOutputStream`, which genuinely
 * works: the stream middleware wraps the persisting channel, so what is stored
 * and accumulated is already what the client was sent. A middleware that
 * rewrites in `modifyOutput` only — a redaction hook, typically — is therefore
 * silently ineffective when the agent is streamed, and is told so once.
 */
const warnUnstreamedOutputHooks = (
  agentName: string,
  agentMiddlewares: PikkuAgentMiddlewareHooks[],
  logger?: { warn: (...args: any[]) => void }
) => {
  if (warnedUnstreamedOutputHooks.has(agentName)) return
  const unstreamed = agentMiddlewares.some(
    (mw) => mw.modifyOutput && !mw.modifyOutputStream
  )
  if (!unstreamed) return
  warnedUnstreamedOutputHooks.add(agentName)
  logger?.warn(
    `Agent '${agentName}' has AI middleware with modifyOutput but no modifyOutputStream — modifyOutput does not apply to streamed runs. Implement modifyOutputStream to affect a streamed reply.`
  )
}

async function postStreamCleanup(
  persistingChannel: PersistingChannel,
  agentRunState: AgentRunStateService,
  runId: string,
  run: {
    agentName: string
    threadId: string
    resourceId?: string
    input: string
  }
): Promise<void> {
  await finalizeAgentRun(agentRunState, {
    runId,
    agentName: run.agentName,
    threadId: run.threadId,
    resourceId: run.resourceId,
    input: run.input,
    // Already what the client received: the stream middleware wraps the
    // persisting channel, so both were accumulated post-rewrite.
    text: persistingChannel.fullText,
    steps: [
      {
        usage: persistingChannel.totalUsage,
        toolCalls: persistingChannel.runToolCalls,
      },
    ],
    usage: persistingChannel.totalUsage,
  })
}

type StepLoopParams = {
  agent: CoreAgent
  runnerParams: AgentRunnerParams
  maxSteps: number
  agentRunner: AgentRunnerService
  streamChannel: AgentStreamChannel
  persistingChannel: PersistingChannel
  channel: AgentStreamChannel
  agentMiddlewares: PikkuAgentMiddlewareHooks[]
}

type StepLoopResult =
  | { outcome: 'done' }
  | { outcome: 'approval'; approvals: ToolApprovalRequired[] }
  | { outcome: 'credential'; credentialRequests: ToolCredentialRequired[] }

async function runStreamStepLoop(
  params: StepLoopParams
): Promise<StepLoopResult> {
  const {
    agent,
    runnerParams,
    maxSteps,
    agentRunner,
    streamChannel,
    channel,
    agentMiddlewares,
  } = params

  const singletonServices = getSingletonServices()

  for (let step = 0; step < maxSteps; step++) {
    if (agent.prepareStep) {
      let stopped = false
      await agent.prepareStep({
        stepNumber: step,
        messages: runnerParams.messages,
        tools: runnerParams.tools,
        toolChoice: runnerParams.toolChoice,
        model: runnerParams.model,
        stop: () => {
          stopped = true
        },
      })
      if (stopped) break
    }

    channel.send({ type: 'step-start', stepNumber: step })

    const stepResult = await agentRunner.stream(runnerParams, streamChannel)

    for (const mw of agentMiddlewares) {
      if (mw.afterStep) {
        await mw.afterStep(singletonServices, {
          stepNumber: step,
          text: stepResult.text,
          toolCalls: stepResult.toolCalls,
          toolResults: stepResult.toolResults,
          usage: stepResult.usage,
          finishReason: stepResult.finishReason,
        })
      }
    }

    if (stepResult.toolCalls.length === 0) break

    const approvalsNeeded = checkForApprovals(stepResult, runnerParams.tools)
    if (approvalsNeeded.length > 0) {
      for (const approval of approvalsNeeded) {
        const toolDef = runnerParams.tools.find(
          (t) => t.name === approval.toolName
        )
        if (toolDef?.approvalDescriptionFn && !approval.reason) {
          try {
            approval.reason = await toolDef.approvalDescriptionFn(approval.args)
          } catch {}
        }
      }
      return { outcome: 'approval', approvals: approvalsNeeded }
    }

    const credentialRequests = checkForCredentialRequests(stepResult)
    if (credentialRequests.length > 0) {
      appendStepMessages(runnerParams, stepResult)
      return { outcome: 'credential', credentialRequests }
    }

    appendStepMessages(runnerParams, stepResult)
  }

  return { outcome: 'done' }
}

export function checkForApprovals(
  stepResult: AgentStepResult,
  tools: AgentRunnerParams['tools']
): ToolApprovalRequired[] {
  const approvals: ToolApprovalRequired[] = []
  for (const tc of stepResult.toolCalls) {
    const toolDef = tools.find((t) => t.name === tc.toolName)

    if (toolDef?.needsApproval) {
      approvals.push(
        new ToolApprovalRequired(tc.toolCallId, tc.toolName, tc.args)
      )
      continue
    }

    if (!toolDef?.forwardsApproval) {
      continue
    }

    const tr = stepResult.toolResults.find(
      (r) => r.toolCallId === tc.toolCallId
    )
    if (
      tr?.result &&
      typeof tr.result === 'object' &&
      APPROVAL_REQUIRED in (tr.result as object)
    ) {
      const r = tr.result as {
        toolName: string
        args: unknown
        reason?: string
        displayToolName?: string
        displayArgs?: unknown
        agentRunId?: string
        subApprovals?: Array<{
          toolCallId: string
          toolName: string
          args: unknown
          reason?: string
          runId: string
        }>
      }
      if (r.subApprovals?.length) {
        for (const sub of r.subApprovals) {
          approvals.push(
            new ToolApprovalRequired(
              sub.toolCallId,
              r.toolName,
              r.args,
              sub.reason,
              sub.toolName,
              sub.args,
              r.agentRunId
            )
          )
        }
      } else {
        approvals.push(
          new ToolApprovalRequired(
            tc.toolCallId,
            r.toolName,
            r.args,
            r.reason,
            r.displayToolName,
            r.displayArgs,
            r.agentRunId
          )
        )
      }
    }
  }
  return approvals
}

export function checkForCredentialRequests(
  stepResult: AgentStepResult
): ToolCredentialRequired[] {
  const requests: ToolCredentialRequired[] = []
  for (const tr of stepResult.toolResults) {
    // knowledge: decisions/security/agent-credential-requests-are-symbol-branded.md
    if (
      tr.result &&
      typeof tr.result === 'object' &&
      CREDENTIAL_REQUIRED in (tr.result as object)
    ) {
      const r = tr.result as {
        credentialName: string
        credentialType: 'oauth2' | 'apikey'
        connectUrl?: string
      }
      const tc = stepResult.toolCalls.find(
        (t) => t.toolCallId === tr.toolCallId
      )
      requests.push(
        new ToolCredentialRequired(
          tr.toolCallId,
          tc?.toolName ?? 'unknown',
          tc?.args ?? {},
          r.credentialName,
          r.credentialType,
          r.connectUrl
        )
      )
    }
  }
  return requests
}

export function appendStepMessages(
  runnerParams: AgentRunnerParams,
  stepResult: AgentStepResult
): void {
  const structuredOutput =
    stepResult.object && typeof stepResult.object === 'object'
      ? (stepResult.object as Record<string, unknown>)
      : null
  const assistantContent =
    structuredOutput?.ui != null
      ? [
          ...(stepResult.text
            ? [{ type: 'text' as const, text: stepResult.text }]
            : []),
          { type: 'generative-ui' as const, spec: structuredOutput.ui },
        ]
      : stepResult.text || undefined

  const assistantMsg: AgentMessage = {
    id: randomUUID(),
    role: 'assistant',
    content: assistantContent,
    toolCalls:
      stepResult.toolCalls.length > 0
        ? stepResult.toolCalls.map((tc) => ({
            id: tc.toolCallId,
            name: tc.toolName,
            args: tc.args as Record<string, unknown>,
          }))
        : undefined,
    ...(stepResult.reasoningContent
      ? { reasoningContent: stepResult.reasoningContent }
      : {}),
    createdAt: new Date(),
  }
  runnerParams.messages.push(assistantMsg)

  if (stepResult.toolResults.length > 0) {
    const toolMsg: AgentMessage = {
      id: randomUUID(),
      role: 'tool',
      toolResults: stepResult.toolResults.map((tr) => ({
        id: tr.toolCallId,
        name: tr.toolName,
        result:
          typeof tr.result === 'string' ? tr.result : JSON.stringify(tr.result),
      })),
      createdAt: new Date(),
    }
    runnerParams.messages.push(toolMsg)
  }
}

function handleApprovals(
  approvals: ToolApprovalRequired[],
  runId: string,
  channel: AgentStreamChannel,
  agentRunState: AgentRunStateService,
  persistingChannel: PersistingChannel
): Promise<void> {
  return (async () => {
    await persistingChannel.flush()

    const pendingApprovals = approvals.map((err) =>
      err.agentRunId
        ? {
            type: 'agent-call' as const,
            toolCallId: err.toolCallId,
            agentName: err.toolName,
            agentRunId: err.agentRunId,
            displayToolName: err.displayToolName ?? err.toolName,
            displayArgs: err.displayArgs ?? err.args,
          }
        : {
            type: 'tool-call' as const,
            toolCallId: err.toolCallId,
            toolName: err.toolName,
            args: err.args,
          }
    )

    await agentRunState.updateRun(runId, {
      status: 'suspended',
      suspendReason: 'approval',
      pendingApprovals,
    })

    for (const err of approvals) {
      const approvalEvent = {
        type: 'approval-request' as const,
        toolCallId: err.toolCallId,
        toolName: err.displayToolName ?? err.toolName,
        args: err.displayArgs ?? err.args,
        reason: err.reason,
        runId,
      }
      channel.send(approvalEvent)
    }
    channel.send({ type: 'done' })
    channel.close()
  })()
}

function handleCredentialRequests(
  requests: ToolCredentialRequired[],
  runId: string,
  channel: AgentStreamChannel,
  agentRunState: AgentRunStateService,
  persistingChannel: PersistingChannel
): Promise<void> {
  return (async () => {
    await persistingChannel.flush()

    const pendingApprovals = requests.map((req) => ({
      type: 'credential-request' as const,
      toolCallId: req.toolCallId,
      toolName: req.toolName,
      args: req.args,
      credentialName: req.credentialName,
      credentialType: req.credentialType,
      connectUrl: req.connectUrl,
    }))

    await agentRunState.updateRun(runId, {
      status: 'suspended',
      suspendReason: 'credential',
      pendingApprovals,
    })

    for (const req of requests) {
      channel.send({
        type: 'credential-request',
        toolCallId: req.toolCallId,
        toolName: req.toolName,
        args: req.args,
        credentialName: req.credentialName,
        credentialType: req.credentialType,
        connectUrl: req.connectUrl,
        runId,
      })
    }
    channel.send({ type: 'done' })
    channel.close()
  })()
}

export async function streamAgent(
  agentName: string,
  input: {
    message: string
    threadId: string
    resourceId: string
    model?: string
    temperature?: number
  },
  channel: AgentStreamChannel,
  params: RunAgentParams,
  agentSessionMap?: Map<string, string>,
  options?: StreamAgentOptions
): Promise<string> {
  const sessionMap = agentSessionMap ?? new Map<string, string>()

  const normalizedInput = {
    ...input,
    resourceId: resolveOwnerResourceId(
      params,
      agentSessionScope(agentName),
      input.resourceId
    ),
  }

  const streamContext: StreamContext = { channel, options }

  const {
    agent,
    packageName,
    resolvedName,
    agentRunner,
    storage,
    memoryConfig,
    threadId,
    userMessage,
    runnerParams,
    maxSteps,
    missingRpcs,
    workingMemorySchemaName,
  } = await prepareAgentRun(
    agentName,
    normalizedInput,
    params,
    sessionMap,
    streamContext
  )

  runnerParams.agentId = agentName

  const singletonServices = getSingletonServices()
  const { agentRunState } = singletonServices
  if (!agentRunState) {
    throw new Error('AgentRunStateService not available in singletonServices')
  }

  if (missingRpcs.length > 0) {
    await agentRunState.createRun({
      agentName,
      threadId,
      resourceId: normalizedInput.resourceId,
      status: 'suspended',
      suspendReason: 'rpc-missing',
      missingRpcs,
      usage: { inputTokens: 0, outputTokens: 0, model: agent.model },
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    channel.send({ type: 'suspended', reason: 'rpc-missing', missingRpcs })
    channel.send({ type: 'done' })
    return ''
  }

  const agentMiddlewares: PikkuAgentMiddlewareHooks[] = [
    ...getWorkingMemoryMiddleware(memoryConfig, storage, {
      threadId,
      workingMemorySchemaName,
      logger: singletonServices.logger,
      schemaService: singletonServices.schema,
    }),
    ...(agent.agentMiddleware ?? []),
  ]

  // One bag per run, shared by every middleware — see PikkuAgentMiddlewareHooks.
  const sharedNotes: Record<string, unknown> = {}

  const { messages: modifiedMessages, instructions: modifiedInstructions } =
    await applyInputMiddleware(
      agentMiddlewares,
      singletonServices,
      {
        messages: runnerParams.messages,
        instructions: runnerParams.instructions,
      },
      sharedNotes
    )
  runnerParams.messages = modifiedMessages
  runnerParams.instructions = modifiedInstructions

  // knowledge: decisions/internals/the-transcript-event-is-sent-ahead-of-the-run.md
  const transcript = sharedNotes[SPOKEN_TRANSCRIPT]
  if (typeof transcript === 'string') {
    channel.send({ type: 'transcript', text: transcript })
  }

  // knowledge: decisions/internals/thread-history-records-the-transcript-not-the-audio.md
  const lastModified = modifiedMessages[modifiedMessages.length - 1]
  const persistedUserMessage =
    lastModified?.id === userMessage.id ? lastModified : userMessage

  const runId = await agentRunState.createRun({
    agentName,
    threadId,
    resourceId: normalizedInput.resourceId,
    status: 'running',
    usage: { inputTokens: 0, outputTokens: 0, model: agent.model },
    createdAt: new Date(),
    updatedAt: new Date(),
  })
  options?.onRunCreated?.(runId)

  // Registered before the first model call and released in `finally`, so the
  // window in which an interrupt can land is exactly the window in which there
  // is something to interrupt.
  const interruptHandle = registerInterruptibleRun(runId)
  runnerParams.abortSignal = interruptHandle.signal
  runnerParams.tools = trackToolExecution(runnerParams.tools, interruptHandle)

  if (storage) {
    await storage.saveMessages(threadId, [persistedUserMessage])
  }

  warnUnstreamedOutputHooks(
    agentName,
    agentMiddlewares,
    singletonServices.logger
  )

  const streamMiddleware = agentMiddlewares
    .filter((mw) => mw.modifyOutputStream)
    .map((mw) => {
      const state: Record<string, unknown> = {}
      const allEvents: AgentStreamEvent[] = []
      return async (services: any, event: any, next: any) => {
        allEvents.push(event)
        const result = await mw.modifyOutputStream!(services, {
          event,
          allEvents,
          state,
          shared: sharedNotes,
          // Sends downstream directly, so a hook can hand back the fast event
          // now and push the slow one when it is ready.
          emit: next,
          signal: interruptHandle.signal,
        })
        if (result == null) return
        if (Array.isArray(result)) {
          for (const r of result) await next(r)
        } else {
          await next(result)
        }
      }
    })

  const agentsMeta = pikkuState(packageName, 'agent', 'agentsMeta')
  const meta = agentsMeta[resolvedName]
  const allChannelMiddleware = combineChannelMiddleware(
    'agent',
    `stream:${agentName}`,
    {
      wireInheritedChannelMiddleware: meta?.channelMiddleware,
      wireChannelMiddleware: [
        ...(agent.channelMiddleware ?? []),
        ...streamMiddleware,
      ],
    }
  )

  const persistingChannel = createPersistingChannel(
    channel,
    storage,
    threadId,
    singletonServices.logger
  )

  const wrappedChannel =
    allChannelMiddleware.length > 0
      ? (wrapChannelWithMiddleware(
          { channel: persistingChannel },
          singletonServices,
          allChannelMiddleware
        ).channel as AgentStreamChannel)
      : persistingChannel

  const credentialFilteredChannel: AgentStreamChannel = {
    ...wrappedChannel,
    // knowledge: decisions/internals/an-agent-stream-send-must-return-the-inner-sends-promise.md
    send: (event: AgentStreamEvent) => {
      if (
        event.type === 'tool-result' &&
        event.result !== null &&
        typeof event.result === 'object' &&
        '__credentialRequired' in event.result
      ) {
        return
      }
      return wrappedChannel.send(event)
    },
  }

  const isDelegateMode = agent.agentMode !== 'supervise' && meta?.agents?.length
  const delegateState = { delegated: false }
  if (isDelegateMode) {
    streamContext.delegateState = delegateState
  }
  const outputChannel = isDelegateMode
    ? {
        ...credentialFilteredChannel,
        send: (event: AgentStreamEvent) => {
          if (
            delegateState.delegated &&
            (event.type === 'text-delta' || event.type === 'reasoning-delta')
          )
            return
          return credentialFilteredChannel.send(event)
        },
        delegateState,
      }
    : credentialFilteredChannel

  try {
    const loopResult = await runStreamStepLoop({
      agent,
      runnerParams,
      maxSteps,
      agentRunner,
      streamChannel: outputChannel,
      persistingChannel,
      channel,
      agentMiddlewares,
    })

    if (loopResult.outcome === 'approval') {
      await handleApprovals(
        loopResult.approvals,
        runId,
        channel,
        agentRunState,
        persistingChannel
      )
      return persistingChannel.fullText
    }

    if (loopResult.outcome === 'credential') {
      await handleCredentialRequests(
        loopResult.credentialRequests,
        runId,
        channel,
        agentRunState,
        persistingChannel
      )
      return persistingChannel.fullText
    }

    await postStreamCleanup(persistingChannel, agentRunState, runId, {
      agentName,
      threadId,
      resourceId: input.resourceId,
      input: lastUserMessageText(runnerParams.messages),
    })

    // knowledge: decisions/internals/the-agent-done-event-goes-through-the-middleware-and-is-awaited.md
    await outputChannel.send({ type: 'done' })
    channel.close()
    return persistingChannel.fullText
  } catch (err) {
    // An interrupt is not a failure: the truncated text is real output the user
    // already heard part of, so it is persisted and marked rather than dropped.
    const interruption = interruptHandle.interruption
    if (interruption || isAbortError(err)) {
      await persistingChannel.flush({ interrupted: true })
      await agentRunState.updateRun(runId, { status: 'interrupted' })
      // Deliberately not awaited. A tool still running must not hold the stream
      // open — the whole point of barge-in is that the agent stops now — so the
      // note lands later and the next run on this thread waits for it instead.
      if (storage) {
        trackInterruptNote(
          threadId,
          persistOrphanedToolResults(interruptHandle, storage, threadId)
        )
      }
      channel.send({
        type: 'interrupted',
        runId,
        text: persistingChannel.fullText,
        reason: interruption?.reason ?? 'user',
      })
      channel.send({ type: 'done' })
      channel.close()
      return persistingChannel.fullText
    }

    for (const mw of agentMiddlewares) {
      if (mw.onError) {
        try {
          await mw.onError(singletonServices, {
            error: err instanceof Error ? err : new Error(String(err)),
            stepNumber: -1,
            messages: runnerParams.messages,
          })
        } catch {}
      }
    }
    await agentRunState.updateRun(runId, {
      status: 'failed',
      errorMessage: err instanceof Error ? err.message : String(err),
    })
    channel.send({
      type: 'error',
      message: err instanceof Error ? err.message : String(err),
    })
    channel.send({ type: 'done' })
    channel.close()
    return persistingChannel.fullText
  } finally {
    interruptHandle.release()
  }
}

/**
 * Stop an in-flight run on behalf of a caller, after checking the run is theirs.
 *
 * Unlike {@link resumeAgent} this needs no channel: it does not continue the
 * stream, it ends one. The `interrupted` event and the truncated message are
 * emitted by the original {@link streamAgent} call on its own channel, so this
 * can be reached over a plain RPC while the stream is held open elsewhere —
 * which is exactly the shape a voice barge-in needs.
 *
 * Ownership is the whole gate, deliberately without {@link assertAgentAuthorized}.
 * Resuming re-enters the agent and approves a tool call, so a revoked grant must
 * block it; stopping is the opposite — if a caller's access to an agent was
 * revoked mid-run, being able to stop their own run is harmless and arguably
 * what you want.
 *
 * Returns `false` when there was nothing to stop. Racing a run that finishes on
 * its own is the normal case in voice, so it is not an error.
 */
export async function interruptAgent(
  input: { runId: string; reason?: AgentInterruption['reason'] },
  params: RunAgentParams
): Promise<AgentInterruptResult> {
  const { agentRunState, logger } = getSingletonServices()
  if (!agentRunState) {
    throw new Error('AgentRunStateService not available in singletonServices')
  }

  const run = await agentRunState.getRun(input.runId)
  if (!run) {
    throw new Error(`No run found for runId ${input.runId}`)
  }
  assertResourceOwner(
    resolveOwnerResourceId(
      params,
      agentSessionScope(run.agentName),
      run.resourceId
    ),
    run.resourceId,
    'run'
  )

  const stopped = signalRunInterrupt(input.runId, {
    reason: input.reason ?? 'user',
  })

  // knowledge: decisions/internals/an-agent-run-owned-by-another-instance-says-so.md
  if (!stopped && run.status === 'running') {
    logger?.warn(
      `Could not interrupt run ${input.runId}: it is running in another process. ` +
        'Interrupts are process-local; fan them out over eventHub to support multiple instances.'
    )
  }

  // Reported after the abort so it names what is *still* running: aborting the
  // model call does nothing to a tool already executing.
  return { stopped, inFlightTools: getInFlightTools(input.runId) }
}

export async function resumeAgent(
  input: {
    runId: string
    toolCallId: string
    approved: boolean
  },
  channel: AgentStreamChannel,
  params: RunAgentParams,
  options?: StreamAgentOptions
): Promise<void> {
  const singletonServices = getSingletonServices()
  const { agentRunState } = singletonServices
  if (!agentRunState) {
    throw new Error('AgentRunStateService not available in singletonServices')
  }

  const run = await agentRunState.getRun(input.runId)
  if (!run) {
    throw new Error(`No run found for runId ${input.runId}`)
  }
  assertResourcePrincipalOwner(
    params,
    agentSessionScope(run.agentName),
    run.resourceId,
    'run'
  )

  const pending = run.pendingApprovals?.find(
    (p) => p.toolCallId === input.toolCallId
  )
  if (!pending) {
    throw new Error(
      `No pending approval for toolCallId ${input.toolCallId} on run ${input.runId}`
    )
  }

  const { agent, packageName, resolvedName } = resolveAgent(run.agentName)

  await assertAgentAuthorized(agent, params, packageName)

  // The read above is not a claim — concurrent resumes all see the same pending
  // approval. `resolveApproval` is the claim, and the loser must not go on to
  // run the tool a second time.
  const claimed = await agentRunState.resolveApproval(
    input.toolCallId,
    input.approved ? 'approved' : 'denied'
  )
  if (!claimed) {
    throw new Error(
      `Approval for toolCallId ${input.toolCallId} was already resolved by another caller`
    )
  }

  const { storage } = resolveMemoryServices(agent, singletonServices)
  const memoryConfig = agent.memory
  const agentRunner = singletonServices.agentRunner
  if (!agentRunner) {
    throw new AIProviderNotConfiguredError()
  }

  if (!input.approved) {
    if (pending.type === 'agent-call') {
      await agentRunState.updateRun(pending.agentRunId, { status: 'failed' })
    }

    const denialResult = deniedToolResult()

    if (storage) {
      await storage.saveMessages(run.threadId, [
        {
          id: randomUUID(),
          role: 'tool',
          toolResults: [
            {
              id: input.toolCallId,
              name:
                pending.type === 'tool-call' ||
                pending.type === 'credential-request'
                  ? pending.toolName
                  : pending.agentName,
              result: denialResult,
            },
          ],
          createdAt: new Date(),
        },
      ])
    }

    channel.send({
      type: 'tool-result',
      toolCallId: input.toolCallId,
      toolName:
        pending.type === 'tool-call' || pending.type === 'credential-request'
          ? pending.toolName
          : pending.agentName,
      result: denialResult,
    })

    const updatedRun = await agentRunState.getRun(run.runId)
    const remaining = updatedRun?.pendingApprovals ?? []

    if (remaining.length > 0) {
      channel.send({ type: 'done' })
      channel.close()
      return
    }

    await agentRunState.updateRun(run.runId, { status: 'running' })

    await continueAfterToolResult(
      run,
      agent,
      packageName,
      resolvedName,
      storage,
      memoryConfig,
      agentRunner,
      channel,
      params,
      agentRunState,
      options
    )
    return
  }

  if (pending.type === 'agent-call') {
    const subRun = await agentRunState.getRun(pending.agentRunId)
    if (!subRun) {
      throw new Error(`Sub-agent run not found: ${pending.agentRunId}`)
    }
    const subPending =
      subRun.pendingApprovals?.find((p) => p.toolCallId === input.toolCallId) ??
      subRun.pendingApprovals?.[0]
    if (!subPending) {
      throw new Error(
        `No pending approval on sub-agent run ${pending.agentRunId}`
      )
    }

    const subChannel = createScopedChannel(channel, subRun.agentName, 'resume')
    channel.send({
      type: 'agent-call',
      agentName: subRun.agentName,
      session: 'resume',
      input: null,
    })

    await resumeAgent(
      {
        runId: pending.agentRunId,
        toolCallId: subPending.toolCallId,
        approved: true,
      },
      subChannel,
      params,
      options
    )

    channel.send({
      type: 'agent-result',
      agentName: subRun.agentName,
      session: 'resume',
      result: null,
    })

    if (storage) {
      await storage.saveMessages(run.threadId, [
        {
          id: randomUUID(),
          role: 'tool',
          toolResults: [
            {
              id: input.toolCallId,
              name: pending.agentName,
              result: 'Sub-agent completed successfully',
            },
          ],
          createdAt: new Date(),
        },
      ])
    }
  } else {
    const streamContext: StreamContext = {
      channel,
      options: { ...options, requiresToolApproval: false },
    }
    const agentMiddlewaresForResume: PikkuAgentMiddlewareHooks[] =
      agent.agentMiddleware ?? []
    const { tools } = await buildToolDefs(
      params,
      new Map<string, string>(),
      run.resourceId,
      resolvedName,
      packageName,
      streamContext,
      agentMiddlewaresForResume
    )

    const matchingTool = tools.find((t) => t.name === pending.toolName)
    if (!matchingTool) {
      throw new Error(
        `Tool "${pending.toolName}" not found in agent definition`
      )
    }

    const toolArgs =
      typeof pending.args === 'string' ? JSON.parse(pending.args) : pending.args

    let toolResult: unknown
    let toolError: string | undefined
    try {
      toolResult = await matchingTool.execute(toolArgs)
    } catch (execErr: any) {
      if (execErr?.payload?.error === 'missing_credential') {
        toolResult = execErr.payload
        toolError = 'missing_credential'
      } else {
        toolError = execErr instanceof Error ? execErr.message : String(execErr)
        toolResult = `Error: ${toolError}`
      }
    }

    const resultStr =
      typeof toolResult === 'string' ? toolResult : JSON.stringify(toolResult)
    if (storage) {
      await storage.saveMessages(run.threadId, [
        {
          id: randomUUID(),
          role: 'tool',
          toolResults: [
            {
              id: input.toolCallId,
              name: pending.toolName,
              result: resultStr,
            },
          ],
          createdAt: new Date(),
        },
      ])
    }

    channel.send({
      type: 'tool-result',
      toolCallId: input.toolCallId,
      toolName: pending.toolName,
      result: toolResult,
      ...(toolError ? { error: toolError } : {}),
    })
  }

  const updatedRun = await agentRunState.getRun(run.runId)
  const remaining = updatedRun?.pendingApprovals ?? []

  if (remaining.length > 0) {
    channel.send({ type: 'done' })
    channel.close()
    return
  }

  await agentRunState.updateRun(run.runId, { status: 'running' })

  await continueAfterToolResult(
    run,
    agent,
    packageName,
    resolvedName,
    storage,
    memoryConfig,
    agentRunner,
    channel,
    params,
    agentRunState,
    options
  )
}

async function continueAfterToolResult(
  run: AgentRunState,
  agent: CoreAgent,
  packageName: string | null,
  resolvedName: string,
  storage: AgentStorageService | undefined,
  memoryConfig: AgentMemoryConfig | undefined,
  agentRunner: AgentRunnerService,
  channel: AgentStreamChannel,
  params: RunAgentParams,
  agentRunState: AgentRunStateService,
  options?: StreamAgentOptions
): Promise<void> {
  const singletonServices = getSingletonServices()
  const agentsMeta = pikkuState(packageName, 'agent', 'agentsMeta')
  const meta = agentsMeta[resolvedName]
  const workingMemorySchemaName = meta?.workingMemorySchema ?? null

  const messages = storage
    ? await storage.getMessages(run.threadId, {
        lastN: memoryConfig?.lastMessages ?? 20,
      })
    : []

  const workingMemoryJsonSchema = workingMemorySchemaName
    ? pikkuState(packageName, 'misc', 'schemas').get(workingMemorySchemaName)
    : undefined

  const contextMessages = await loadContextMessages(
    memoryConfig,
    storage,
    { message: '', threadId: run.threadId, resourceId: run.resourceId },
    workingMemoryJsonSchema
  )

  const allMessages = [...contextMessages, ...messages]
  const trimmedMessages = trimMessages(allMessages)

  const instructions = await buildInstructions(resolvedName, packageName)

  const agentMiddlewares: PikkuAgentMiddlewareHooks[] = [
    ...getWorkingMemoryMiddleware(memoryConfig, storage, {
      threadId: run.threadId,
      workingMemorySchemaName,
      logger: singletonServices.logger,
      schemaService: singletonServices.schema,
    }),
    ...(agent.agentMiddleware ?? []),
  ]
  // One bag per run, shared by every middleware — see PikkuAgentMiddlewareHooks.
  const sharedNotes: Record<string, unknown> = {}

  const { messages: modifiedMessages, instructions: modifiedInstructions } =
    await applyInputMiddleware(
      agentMiddlewares,
      singletonServices,
      { messages: trimmedMessages, instructions: instructions },
      sharedNotes
    )

  // knowledge: decisions/internals/a-resumed-agent-turn-is-as-interruptible-as-the-first.md
  const interruptHandle = registerInterruptibleRun(run.runId)

  warnUnstreamedOutputHooks(
    run.agentName,
    agentMiddlewares,
    singletonServices.logger
  )

  const streamMiddleware = agentMiddlewares
    .filter((mw) => mw.modifyOutputStream)
    .map((mw) => {
      const state: Record<string, unknown> = {}
      const allEvents: AgentStreamEvent[] = []
      return async (services: any, event: any, next: any) => {
        allEvents.push(event)
        const result = await mw.modifyOutputStream!(services, {
          event,
          allEvents,
          state,
          shared: sharedNotes,
          // Sends downstream directly, so a hook can hand back the fast event
          // now and push the slow one when it is ready.
          emit: next,
          signal: interruptHandle.signal,
        })
        if (result == null) return
        if (Array.isArray(result)) {
          for (const r of result) await next(r)
        } else {
          await next(result)
        }
      }
    })

  const allChannelMiddleware = combineChannelMiddleware(
    'agent',
    `stream:${run.agentName}`,
    {
      wireInheritedChannelMiddleware: meta?.channelMiddleware,
      wireChannelMiddleware: [
        ...(agent.channelMiddleware ?? []),
        ...streamMiddleware,
      ],
    }
  )

  const persistingChannel = createPersistingChannel(
    channel,
    storage,
    run.threadId,
    singletonServices.logger
  )

  const wrappedChannel =
    allChannelMiddleware.length > 0
      ? (wrapChannelWithMiddleware(
          { channel: persistingChannel },
          singletonServices,
          allChannelMiddleware
        ).channel as AgentStreamChannel)
      : persistingChannel

  const streamContext: StreamContext = { channel, options }
  const resumeTools = (
    await buildToolDefs(
      params,
      new Map<string, string>(),
      run.resourceId,
      resolvedName,
      packageName,
      streamContext,
      agentMiddlewares
    )
  ).tools

  const resolved = resolveModelConfig(resolvedName, agent)
  const maxSteps = resolved.maxSteps ?? 10

  const runnerParams: AgentRunnerParams = {
    model: resolved.model,
    temperature: resolved.temperature,
    instructions: modifiedInstructions,
    messages: modifiedMessages,
    tools: resumeTools,
    maxSteps: 1,
    toolChoice: (agent.toolChoice ?? 'auto') as 'auto' | 'required' | 'none',
    providerOptions: agent.providerOptions,
    outputSchema: meta?.outputSchema
      ? pikkuState(packageName, 'misc', 'schemas').get(meta.outputSchema)
      : undefined,
  }

  runnerParams.abortSignal = interruptHandle.signal
  runnerParams.tools = trackToolExecution(runnerParams.tools, interruptHandle)

  try {
    const loopResult = await runStreamStepLoop({
      agent,
      runnerParams,
      maxSteps,
      agentRunner,
      streamChannel: wrappedChannel,
      persistingChannel,
      channel,
      agentMiddlewares,
    })

    if (loopResult.outcome === 'approval') {
      await handleApprovals(
        loopResult.approvals,
        run.runId,
        channel,
        agentRunState,
        persistingChannel
      )
      return
    }

    if (loopResult.outcome === 'credential') {
      await handleCredentialRequests(
        loopResult.credentialRequests,
        run.runId,
        channel,
        agentRunState,
        persistingChannel
      )
      return
    }

    await postStreamCleanup(persistingChannel, agentRunState, run.runId, {
      ...run,
      input: lastUserMessageText(runnerParams.messages),
    })

    // knowledge: decisions/internals/the-agent-done-event-goes-through-the-middleware-and-is-awaited.md
    await wrappedChannel.send({ type: 'done' })
    channel.close()
  } catch (err) {
    // Same reasoning as the first turn: an interrupt is not a failure, and the
    // part of the reply the user already heard is real output.
    const interruption = interruptHandle.interruption
    if (interruption || isAbortError(err)) {
      await persistingChannel.flush({ interrupted: true })
      await agentRunState.updateRun(run.runId, { status: 'interrupted' })
      if (storage) {
        trackInterruptNote(
          run.threadId,
          persistOrphanedToolResults(interruptHandle, storage, run.threadId)
        )
      }
      channel.send({
        type: 'interrupted',
        runId: run.runId,
        text: persistingChannel.fullText,
        reason: interruption?.reason ?? 'user',
      })
      channel.send({ type: 'done' })
      channel.close()
      return
    }

    for (const mw of agentMiddlewares) {
      if (mw.onError) {
        try {
          await mw.onError(singletonServices, {
            error: err instanceof Error ? err : new Error(String(err)),
            stepNumber: -1,
            messages: runnerParams.messages,
          })
        } catch {}
      }
    }
    await agentRunState.updateRun(run.runId, {
      status: 'failed',
      errorMessage: err instanceof Error ? err.message : String(err),
    })
    channel.send({
      type: 'error',
      message: err instanceof Error ? err.message : String(err),
    })
    channel.send({ type: 'done' })
    channel.close()
  } finally {
    interruptHandle.release()
  }
}
