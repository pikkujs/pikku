import type {
  AIStreamChannel,
  AIStreamEvent,
  AIMessage,
  AIToolCall,
  AIToolResult,
  PikkuAIMiddlewareHooks,
  AgentRunState,
  CoreAIAgent,
  AIAgentMemoryConfig,
} from './ai-agent.types.js'
import { pikkuState, getSingletonServices } from '../../pikku-state.js'
import { AIProviderNotConfiguredError } from '../../errors/errors.js'
import { randomUUID } from './ai-agent-utils.js'
import {
  combineChannelMiddleware,
  wrapChannelWithMiddleware,
} from '../channel/channel-middleware-runner.js'
import type { AIStorageService } from '../../services/ai-storage-service.js'
import type {
  AIAgentRunnerParams,
  AIAgentStepResult,
} from '../../services/ai-agent-runner-service.js'

import {
  resolveMemoryServices,
  loadContextMessages,
  trimMessages,
  getWorkingMemoryMiddleware,
} from './ai-agent-memory.js'
import {
  prepareAgentRun,
  resolveAgent,
  buildInstructions,
  buildToolDefs,
  createScopedChannel,
  ToolApprovalRequired,
  ToolCredentialRequired,
  type RunAIAgentParams,
  type StreamAIAgentOptions,
  type StreamContext,
} from './ai-agent-prepare.js'
import { resolveModelConfig } from './ai-agent-model-config.js'
import type { AIRunStateService } from '../../services/ai-run-state-service.js'
import type { AIAgentRunnerService } from '../../services/ai-agent-runner-service.js'

type PersistingChannel = AIStreamChannel & {
  fullText: string
  flush: () => Promise<void>
  totalUsage: { inputTokens: number; outputTokens: number; model?: string }
}

function createPersistingChannel(
  parent: AIStreamChannel,
  storage: AIStorageService | undefined,
  threadId: string
): PersistingChannel {
  let fullText = ''
  let stepText = ''
  let stepGenerativeUI: unknown | null = null
  let stepToolCalls: AIToolCall[] = []
  let stepToolResults: AIToolResult[] = []
  const totalUsage: {
    inputTokens: number
    outputTokens: number
    model?: string
  } = {
    inputTokens: 0,
    outputTokens: 0,
  }

  const flushStep = async () => {
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
      const assistantMsg: AIMessage = {
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
        createdAt: new Date(),
      }
      const messages: AIMessage[] = [assistantMsg]
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
    flush: flushStep,
    close: () => parent.close(),
    sendBinary: (data) => parent.sendBinary(data),
    send: (event: AIStreamEvent) => {
      if (storage) {
        switch (event.type) {
          case 'text-delta':
            stepText += event.text
            fullText += event.text
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
            })
            break
          case 'generative-ui':
            stepGenerativeUI = event.spec
            break
          case 'usage':
            totalUsage.inputTokens += event.tokens.input
            totalUsage.outputTokens += event.tokens.output
            if (event.model) totalUsage.model = event.model
            flushStep()
            break
          case 'done':
            flushStep()
            break
        }
      }
      parent.send(event)
    },
    setState: (s) => parent.setState(s),
    getState: () => parent.getState(),
    clearState: () => parent.clearState(),
  }
  return channel
}

async function postStreamCleanup(
  persistingChannel: PersistingChannel,
  aiMiddlewares: PikkuAIMiddlewareHooks[],
  singletonServices: any,
  messages: AIMessage[],
  aiRunState: AIRunStateService,
  runId: string
): Promise<void> {
  const usage = persistingChannel.totalUsage
  let outputText = persistingChannel.fullText
  let outputMessages = messages
  for (let i = aiMiddlewares.length - 1; i >= 0; i--) {
    const mw = aiMiddlewares[i]
    if (mw.modifyOutput) {
      const result = await mw.modifyOutput(singletonServices, {
        text: outputText,
        messages: outputMessages,
        usage: {
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
        },
      })
      outputText = result.text
      outputMessages = result.messages
    }
  }

  await aiRunState.updateRun(runId, {
    status: 'completed',
    ...(usage.model
      ? {
          usage: {
            inputTokens: usage.inputTokens,
            outputTokens: usage.outputTokens,
            model: usage.model,
          },
        }
      : {}),
  })
}

type StepLoopParams = {
  agent: CoreAIAgent
  runnerParams: AIAgentRunnerParams
  maxSteps: number
  agentRunner: AIAgentRunnerService
  streamChannel: AIStreamChannel
  persistingChannel: PersistingChannel
  channel: AIStreamChannel
  runId: string
  aiMiddlewares: PikkuAIMiddlewareHooks[]
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
    runId,
    aiMiddlewares,
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

    for (const mw of aiMiddlewares) {
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

    const approvalsNeeded = checkForApprovals(
      stepResult,
      runnerParams.tools,
      runId
    )
    if (approvalsNeeded.length > 0) {
      // For each approval, call approvalDescriptionFn if available
      for (const approval of approvalsNeeded) {
        const toolDef = runnerParams.tools.find(
          (t) => t.name === approval.toolName
        )
        if (toolDef?.approvalDescriptionFn && !approval.reason) {
          try {
            approval.reason = await toolDef.approvalDescriptionFn(approval.args)
          } catch {
            // If description generation fails, continue without it
          }
        }
      }
      return { outcome: 'approval', approvals: approvalsNeeded }
    }

    const credentialRequests = checkForCredentialRequests(stepResult, runId)
    if (credentialRequests.length > 0) {
      // Append step messages so the tool result is preserved for resume
      appendStepMessages(runnerParams, stepResult)
      return { outcome: 'credential', credentialRequests }
    }

    appendStepMessages(runnerParams, stepResult)
  }

  return { outcome: 'done' }
}

export function checkForApprovals(
  stepResult: AIAgentStepResult,
  tools: AIAgentRunnerParams['tools'],
  runId: string
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

    const tr = stepResult.toolResults.find(
      (r) => r.toolCallId === tc.toolCallId
    )
    if (
      tr?.result &&
      typeof tr.result === 'object' &&
      '__approvalRequired' in (tr.result as object)
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
  stepResult: AIAgentStepResult,
  runId: string
): ToolCredentialRequired[] {
  const requests: ToolCredentialRequired[] = []
  for (const tr of stepResult.toolResults) {
    if (
      tr.result &&
      typeof tr.result === 'object' &&
      '__credentialRequired' in (tr.result as object)
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
  runnerParams: AIAgentRunnerParams,
  stepResult: AIAgentStepResult
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

  const assistantMsg: AIMessage = {
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
    const toolMsg: AIMessage = {
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
  channel: AIStreamChannel,
  aiRunState: AIRunStateService,
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

    await aiRunState.updateRun(runId, {
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
  channel: AIStreamChannel,
  aiRunState: AIRunStateService,
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

    await aiRunState.updateRun(runId, {
      status: 'suspended',
      suspendReason: 'credential',
      pendingApprovals,
    })

    // The __credentialRequired tool result is suppressed from the stream, so
    // credential-request events (with the runId needed for /resume) are the
    // client's signal to show Connect/Ignore buttons — mirroring how
    // approval-request suspensions work.
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

export async function streamAIAgent(
  agentName: string,
  input: {
    message: string
    threadId: string
    resourceId: string
    model?: string
    temperature?: number
  },
  channel: AIStreamChannel,
  params: RunAIAgentParams,
  agentSessionMap?: Map<string, string>,
  options?: StreamAIAgentOptions
): Promise<string> {
  const sessionMap = agentSessionMap ?? new Map<string, string>()

  const normalizedInput = input

  const streamContext: StreamContext = { channel, options }
  // delegateState is attached after prepareAgentRun resolves the agent config

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
  const { aiRunState } = singletonServices
  if (!aiRunState) {
    throw new Error('AIRunStateService not available in singletonServices')
  }

  if (missingRpcs.length > 0) {
    await aiRunState.createRun({
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

  const aiMiddlewares: PikkuAIMiddlewareHooks[] = [
    ...getWorkingMemoryMiddleware(memoryConfig, storage, {
      threadId,
      workingMemorySchemaName,
      logger: singletonServices.logger,
      schemaService: singletonServices.schema,
    }),
    ...(agent.aiMiddleware ?? []),
  ]

  let modifiedMessages = runnerParams.messages
  let modifiedInstructions = runnerParams.instructions
  for (const mw of aiMiddlewares) {
    if (mw.modifyInput) {
      const result = await mw.modifyInput(singletonServices, {
        messages: modifiedMessages,
        instructions: modifiedInstructions,
      })
      modifiedMessages = result.messages
      modifiedInstructions = result.instructions
    }
  }
  runnerParams.messages = modifiedMessages
  runnerParams.instructions = modifiedInstructions

  const runId = await aiRunState.createRun({
    agentName,
    threadId,
    resourceId: normalizedInput.resourceId,
    status: 'running',
    usage: { inputTokens: 0, outputTokens: 0, model: agent.model },
    createdAt: new Date(),
    updatedAt: new Date(),
  })
  options?.onRunCreated?.(runId)

  if (storage) {
    await storage.saveMessages(threadId, [userMessage])
  }

  const streamMiddleware = aiMiddlewares
    .filter((mw) => mw.modifyOutputStream)
    .map((mw) => {
      const state: Record<string, unknown> = {}
      const allEvents: AIStreamEvent[] = []
      return async (services: any, event: any, next: any) => {
        allEvents.push(event)
        const result = await mw.modifyOutputStream!(services, {
          event,
          allEvents,
          state,
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
        ...((agent.channelMiddleware as any[]) ?? []),
        ...streamMiddleware,
      ],
    }
  )

  const persistingChannel = createPersistingChannel(channel, storage, threadId)

  const wrappedChannel =
    allChannelMiddleware.length > 0
      ? (wrapChannelWithMiddleware(
          { channel: persistingChannel },
          singletonServices,
          allChannelMiddleware
        ).channel as AIStreamChannel)
      : persistingChannel

  // Tool results carrying the __credentialRequired marker must never reach
  // the client or persisted history: the run suspends with credential-request
  // events instead (mirroring approvals), and leaving the tool call
  // unresulted is what lets the client resume it after connecting.
  const credentialFilteredChannel: AIStreamChannel = {
    ...wrappedChannel,
    send: (event: AIStreamEvent) => {
      if (
        event.type === 'tool-result' &&
        event.result !== null &&
        typeof event.result === 'object' &&
        '__credentialRequired' in event.result
      ) {
        return
      }
      wrappedChannel.send(event)
    },
  }

  // In delegate mode (default), suppress parent's text from reaching the client
  // AFTER a sub-agent has been called. If the parent responds directly (no delegation),
  // its text goes through normally. Sub-agent text bypasses this path entirely
  // (goes through subChannel → channel directly).
  const isDelegateMode = agent.agentMode !== 'supervise' && meta.agents?.length
  const delegateState = { delegated: false }
  if (isDelegateMode) {
    streamContext.delegateState = delegateState
  }
  const outputChannel = isDelegateMode
    ? {
        ...credentialFilteredChannel,
        send: (event: AIStreamEvent) => {
          if (
            delegateState.delegated &&
            (event.type === 'text-delta' || event.type === 'reasoning-delta')
          )
            return
          credentialFilteredChannel.send(event)
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
      runId,
      aiMiddlewares,
    })

    if (loopResult.outcome === 'approval') {
      await handleApprovals(
        loopResult.approvals,
        runId,
        channel,
        aiRunState,
        persistingChannel
      )
      return persistingChannel.fullText
    }

    if (loopResult.outcome === 'credential') {
      await handleCredentialRequests(
        loopResult.credentialRequests,
        runId,
        channel,
        aiRunState,
        persistingChannel
      )
      return persistingChannel.fullText
    }

    await postStreamCleanup(
      persistingChannel,
      aiMiddlewares,
      singletonServices,
      runnerParams.messages,
      aiRunState,
      runId
    )

    channel.send({ type: 'done' })
    channel.close()
    return persistingChannel.fullText
  } catch (err) {
    if (process.env.PIKKU_AI_DEBUG === '1' || process.env.CI === 'true') {
      // eslint-disable-next-line no-console
      console.error(
        `[wire] streamAIAgent THREW: ${err instanceof Error ? err.stack : String(err)}`
      )
    }
    for (const mw of aiMiddlewares) {
      if (mw.onError) {
        try {
          await mw.onError(singletonServices, {
            error: err instanceof Error ? err : new Error(String(err)),
            stepNumber: -1,
            messages: runnerParams.messages,
          })
        } catch {
          // onError hooks must not affect error flow
        }
      }
    }
    await aiRunState.updateRun(runId, {
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
  }
}

export async function resumeAIAgent(
  input: {
    runId: string
    toolCallId: string
    approved: boolean
  },
  channel: AIStreamChannel,
  params: RunAIAgentParams,
  options?: StreamAIAgentOptions
): Promise<void> {
  const singletonServices = getSingletonServices()
  const { aiRunState } = singletonServices
  if (!aiRunState) {
    throw new Error('AIRunStateService not available in singletonServices')
  }

  const run = await aiRunState.getRun(input.runId)
  if (!run) {
    throw new Error(`No run found for runId ${input.runId}`)
  }

  const pending = run.pendingApprovals?.find(
    (p) => p.toolCallId === input.toolCallId
  )
  if (!pending) {
    throw new Error(
      `No pending approval for toolCallId ${input.toolCallId} on run ${input.runId}`
    )
  }

  await aiRunState.resolveApproval(
    input.toolCallId,
    input.approved ? 'approved' : 'denied'
  )

  const { agent, packageName, resolvedName } = resolveAgent(run.agentName)
  const { storage } = resolveMemoryServices(agent, singletonServices)
  const memoryConfig = agent.memory
  const agentRunner = singletonServices.aiAgentRunner
  if (!agentRunner) {
    throw new AIProviderNotConfiguredError()
  }

  if (!input.approved) {
    if (pending.type === 'agent-call') {
      await aiRunState.updateRun(pending.agentRunId, { status: 'failed' })
    }

    const denialResult =
      'The user explicitly declined this action. Inform them that it was declined and do not retry.'

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

    // Check remaining pending approvals
    const updatedRun = await aiRunState.getRun(run.runId)
    const remaining = updatedRun?.pendingApprovals ?? []

    if (remaining.length > 0) {
      // Still waiting for more approvals - don't continue step loop
      channel.send({ type: 'done' })
      channel.close()
      return
    }

    await aiRunState.updateRun(run.runId, { status: 'running' })

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
      aiRunState,
      options
    )
    return
  }

  if (pending.type === 'agent-call') {
    const subRun = await aiRunState.getRun(pending.agentRunId)
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

    await resumeAIAgent(
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
    const aiMiddlewaresForResume: PikkuAIMiddlewareHooks[] =
      agent.aiMiddleware ?? []
    const { tools } = await buildToolDefs(
      params,
      new Map<string, string>(),
      run.resourceId,
      resolvedName,
      packageName,
      streamContext,
      aiMiddlewaresForResume
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
    let isError = false
    try {
      toolResult = await matchingTool.execute(toolArgs)
    } catch (execErr: any) {
      if (execErr?.payload?.error === 'missing_credential') {
        toolResult = execErr.payload
      } else {
        toolResult = `Error: ${execErr instanceof Error ? execErr.message : String(execErr)}`
      }
      isError = true
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
      ...(isError ? { isError: true } : {}),
    })
  }

  // Check remaining pending approvals after processing this one
  const updatedRun = await aiRunState.getRun(run.runId)
  const remaining = updatedRun?.pendingApprovals ?? []

  if (remaining.length > 0) {
    // Still waiting for more approvals - don't continue step loop
    channel.send({ type: 'done' })
    channel.close()
    return
  }

  await aiRunState.updateRun(run.runId, { status: 'running' })

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
    aiRunState,
    options
  )
}

async function continueAfterToolResult(
  run: AgentRunState,
  agent: CoreAIAgent,
  packageName: string | null,
  resolvedName: string,
  storage: AIStorageService | undefined,
  memoryConfig: AIAgentMemoryConfig | undefined,
  agentRunner: AIAgentRunnerService,
  channel: AIStreamChannel,
  params: RunAIAgentParams,
  aiRunState: AIRunStateService,
  options?: StreamAIAgentOptions
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

  const aiMiddlewares: PikkuAIMiddlewareHooks[] = [
    ...getWorkingMemoryMiddleware(memoryConfig, storage, {
      threadId: run.threadId,
      workingMemorySchemaName,
      logger: singletonServices.logger,
      schemaService: singletonServices.schema,
    }),
    ...(agent.aiMiddleware ?? []),
  ]
  let modifiedMessages = trimmedMessages
  let modifiedInstructions = instructions
  for (const mw of aiMiddlewares) {
    if (mw.modifyInput) {
      const result = await mw.modifyInput(singletonServices, {
        messages: modifiedMessages,
        instructions: modifiedInstructions,
      })
      modifiedMessages = result.messages
      modifiedInstructions = result.instructions
    }
  }

  const streamMiddleware = aiMiddlewares
    .filter((mw) => mw.modifyOutputStream)
    .map((mw) => {
      const state: Record<string, unknown> = {}
      const allEvents: AIStreamEvent[] = []
      return async (services: any, event: any, next: any) => {
        allEvents.push(event)
        const result = await mw.modifyOutputStream!(services, {
          event,
          allEvents,
          state,
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
        ...((agent.channelMiddleware as any[]) ?? []),
        ...streamMiddleware,
      ],
    }
  )

  const persistingChannel = createPersistingChannel(
    channel,
    storage,
    run.threadId
  )

  const wrappedChannel =
    allChannelMiddleware.length > 0
      ? (wrapChannelWithMiddleware(
          { channel: persistingChannel },
          singletonServices,
          allChannelMiddleware
        ).channel as AIStreamChannel)
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
      aiMiddlewares
    )
  ).tools

  const resolved = resolveModelConfig(resolvedName, agent)
  const maxSteps = resolved.maxSteps ?? 10

  const runnerParams: AIAgentRunnerParams = {
    model: resolved.model,
    temperature: resolved.temperature,
    instructions: modifiedInstructions,
    messages: modifiedMessages,
    tools: resumeTools,
    maxSteps: 1,
    toolChoice: (agent.toolChoice ?? 'auto') as 'auto' | 'required' | 'none',
    outputSchema: meta?.outputSchema
      ? pikkuState(packageName, 'misc', 'schemas').get(meta.outputSchema)
      : undefined,
  }

  try {
    const loopResult = await runStreamStepLoop({
      agent,
      runnerParams,
      maxSteps,
      agentRunner,
      streamChannel: wrappedChannel,
      persistingChannel,
      channel,
      runId: run.runId,
      aiMiddlewares,
    })

    if (loopResult.outcome === 'approval') {
      await handleApprovals(
        loopResult.approvals,
        run.runId,
        channel,
        aiRunState,
        persistingChannel
      )
      return
    }

    if (loopResult.outcome === 'credential') {
      await handleCredentialRequests(
        loopResult.credentialRequests,
        run.runId,
        channel,
        aiRunState,
        persistingChannel
      )
      return
    }

    await postStreamCleanup(
      persistingChannel,
      aiMiddlewares,
      singletonServices,
      runnerParams.messages,
      aiRunState,
      run.runId
    )

    channel.send({ type: 'done' })
    channel.close()
  } catch (err) {
    for (const mw of aiMiddlewares) {
      if (mw.onError) {
        try {
          await mw.onError(singletonServices, {
            error: err instanceof Error ? err : new Error(String(err)),
            stepNumber: -1,
            messages: runnerParams.messages,
          })
        } catch {
          // onError hooks must not affect error flow
        }
      }
    }
    await aiRunState.updateRun(run.runId, {
      status: 'failed',
      errorMessage: err instanceof Error ? err.message : String(err),
    })
    channel.send({
      type: 'error',
      message: err instanceof Error ? err.message : String(err),
    })
    channel.send({ type: 'done' })
    channel.close()
  }
}
