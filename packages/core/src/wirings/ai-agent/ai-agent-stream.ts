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
import {
  combineChannelMiddleware,
  wrapChannelWithMiddleware,
} from '../channel/channel-middleware-runner.js'
import { randomUUID } from 'crypto'
import type { AIStorageService } from '../../services/ai-storage-service.js'
import type {
  AIAgentRunnerParams,
  AIAgentStepResult,
} from '../../services/ai-agent-runner-service.js'

import {
  parseWorkingMemory,
  deepMergeWorkingMemory,
  resolveMemoryServices,
  loadContextMessages,
  trimMessages,
} from './ai-agent-memory.js'
import {
  prepareAgentRun,
  resolveAgent,
  buildInstructions,
  buildToolDefs,
  createScopedChannel,
  ToolApprovalRequired,
  type RunAIAgentParams,
  type StreamAIAgentOptions,
  type StreamContext,
} from './ai-agent-prepare.js'
import {
  createAssistantUIChannel,
  parseAssistantUIInput,
} from './ai-agent-assistant-ui.js'
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
    const calls = stepToolCalls
    const results = stepToolResults
    stepText = ''
    stepToolCalls = []
    stepToolResults = []
    if (text || calls.length > 0) {
      const assistantMsg: AIMessage = {
        id: randomUUID(),
        role: 'assistant',
        content: text || undefined,
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
  }
  return channel
}

async function postStreamCleanup(
  persistingChannel: PersistingChannel,
  aiMiddlewares: PikkuAIMiddlewareHooks[],
  singletonServices: any,
  storage: AIStorageService | undefined,
  memoryConfig: any,
  threadId: string,
  workingMemorySchemaName: string | null,
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

  if (storage && memoryConfig?.workingMemory && outputText) {
    const parsed = parseWorkingMemory(outputText)
    if (parsed) {
      const existing =
        (await storage.getWorkingMemory(threadId, 'thread')) ?? {}
      const merged = deepMergeWorkingMemory(existing, parsed)

      if (singletonServices.schema && workingMemorySchemaName) {
        try {
          await singletonServices.schema.validateSchema(
            workingMemorySchemaName,
            merged
          )
        } catch (err) {
          singletonServices.logger.warn(
            `Working memory validation failed: ${err instanceof Error ? err.message : String(err)}`
          )
        }
      }

      await storage.saveWorkingMemory(threadId, 'thread', merged)
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
  persistingChannel: PersistingChannel
  channel: AIStreamChannel
  runId: string
  aiMiddlewares: PikkuAIMiddlewareHooks[]
}

type StepLoopResult =
  | { outcome: 'done' }
  | { outcome: 'approval'; approval: ToolApprovalRequired }

async function runStreamStepLoop(
  params: StepLoopParams
): Promise<StepLoopResult> {
  const {
    agent,
    runnerParams,
    maxSteps,
    agentRunner,
    persistingChannel,
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

    const stepResult = await agentRunner.stream(runnerParams, persistingChannel)

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

    const approvalNeeded = checkForApproval(
      stepResult,
      runnerParams.tools,
      runId
    )
    if (approvalNeeded) {
      return { outcome: 'approval', approval: approvalNeeded }
    }

    appendStepMessages(runnerParams, stepResult)
  }

  return { outcome: 'done' }
}

function checkForApproval(
  stepResult: AIAgentStepResult,
  tools: AIAgentRunnerParams['tools'],
  runId: string
): ToolApprovalRequired | null {
  for (const tc of stepResult.toolCalls) {
    const toolDef = tools.find((t) => t.name === tc.toolName)

    if (toolDef?.needsApproval) {
      return new ToolApprovalRequired(tc.toolCallId, tc.toolName, tc.args)
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
      }
      return new ToolApprovalRequired(
        tc.toolCallId,
        r.toolName,
        r.args,
        r.reason,
        r.displayToolName,
        r.displayArgs,
        r.agentRunId
      )
    }
  }
  return null
}

function appendStepMessages(
  runnerParams: AIAgentRunnerParams,
  stepResult: AIAgentStepResult
): void {
  const assistantMsg: AIMessage = {
    id: randomUUID(),
    role: 'assistant',
    content: stepResult.text || undefined,
    toolCalls:
      stepResult.toolCalls.length > 0
        ? stepResult.toolCalls.map((tc) => ({
            id: tc.toolCallId,
            name: tc.toolName,
            args: tc.args as Record<string, unknown>,
          }))
        : undefined,
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

function handleApproval(
  err: ToolApprovalRequired,
  runId: string,
  channel: AIStreamChannel,
  aiRunState: AIRunStateService,
  persistingChannel: PersistingChannel
): Promise<void> {
  return (async () => {
    await persistingChannel.flush()

    const pendingApproval = err.agentRunId
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

    await aiRunState.updateRun(runId, {
      status: 'suspended',
      suspendReason: 'approval',
      pendingApprovals: [pendingApproval],
    })

    const approvalEvent = {
      type: 'approval-request' as const,
      toolCallId: err.toolCallId,
      toolName: err.displayToolName ?? err.toolName,
      args: err.displayArgs ?? err.args,
      reason: err.reason,
      runId,
    }
    channel.send(approvalEvent as any)
    channel.send({ type: 'done' })
    channel.close()
  })()
}

export async function streamAIAgent(
  agentName: string,
  input:
    | { message: string; threadId: string; resourceId: string }
    | Record<string, unknown>,
  channel: AIStreamChannel,
  params: RunAIAgentParams,
  agentSessionMap?: Map<string, string>,
  options?: StreamAIAgentOptions
): Promise<void> {
  const sessionMap = agentSessionMap ?? new Map<string, string>()

  const { agent: resolvedAgentForProtocol } = resolveAgent(agentName)
  const inputRecord = input as Record<string, unknown>
  const useUIMessageStream =
    resolvedAgentForProtocol.protocol === 'ui-message-stream' ||
    Array.isArray(inputRecord.messages)
  let normalizedInput: { message: string; threadId: string; resourceId: string }
  if (useUIMessageStream) {
    normalizedInput = parseAssistantUIInput(inputRecord)
    channel = createAssistantUIChannel(channel)
  } else {
    normalizedInput = input as {
      message: string
      threadId: string
      resourceId: string
    }
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
    return
  }

  const aiMiddlewares: PikkuAIMiddlewareHooks[] = agent.aiMiddleware ?? []

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
        if (result != null) await next(result)
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

  const wrappedChannel =
    allChannelMiddleware.length > 0
      ? (wrapChannelWithMiddleware(
          { channel },
          singletonServices,
          allChannelMiddleware
        ).channel as AIStreamChannel)
      : channel

  const persistingChannel = createPersistingChannel(
    wrappedChannel,
    storage,
    threadId
  )

  try {
    const loopResult = await runStreamStepLoop({
      agent,
      runnerParams,
      maxSteps,
      agentRunner,
      persistingChannel,
      channel,
      runId,
      aiMiddlewares,
    })

    if (loopResult.outcome === 'approval') {
      await handleApproval(
        loopResult.approval,
        runId,
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
      storage,
      memoryConfig,
      threadId,
      workingMemorySchemaName,
      runnerParams.messages,
      aiRunState,
      runId
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
    await aiRunState.updateRun(runId, { status: 'failed' })
    channel.send({
      type: 'error',
      message: err instanceof Error ? err.message : String(err),
    })
    channel.send({ type: 'done' })
    channel.close()
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
    throw new Error('AIAgentRunnerService not available in singletonServices')
  }

  if (!input.approved) {
    if (pending.type === 'agent-call') {
      await aiRunState.updateRun(pending.agentRunId, { status: 'failed' })
    }

    const denialResult = 'Tool call was not approved by the user'

    if (storage) {
      await storage.saveMessages(run.threadId, [
        {
          id: randomUUID(),
          role: 'tool',
          toolResults: [
            {
              id: input.toolCallId,
              name:
                pending.type === 'tool-call'
                  ? pending.toolName
                  : pending.agentName,
              result: denialResult,
            },
          ],
          createdAt: new Date(),
        },
      ])
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
    const subPending = subRun.pendingApprovals?.[0]
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
    const { tools } = buildToolDefs(
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
    try {
      toolResult = await matchingTool.execute(toolArgs)
    } catch (execErr) {
      toolResult = `Error: ${execErr instanceof Error ? execErr.message : String(execErr)}`
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
    })
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

  const instructions = buildInstructions(resolvedName, packageName)

  const aiMiddlewares: PikkuAIMiddlewareHooks[] = agent.aiMiddleware ?? []
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
        if (result != null) await next(result)
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

  const wrappedChannel =
    allChannelMiddleware.length > 0
      ? (wrapChannelWithMiddleware(
          { channel },
          singletonServices,
          allChannelMiddleware
        ).channel as AIStreamChannel)
      : channel

  const persistingChannel = createPersistingChannel(
    wrappedChannel,
    storage,
    run.threadId
  )

  const streamContext: StreamContext = { channel, options }
  const resumeTools = buildToolDefs(
    params,
    new Map<string, string>(),
    run.resourceId,
    resolvedName,
    packageName,
    streamContext,
    aiMiddlewares
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
      persistingChannel,
      channel,
      runId: run.runId,
      aiMiddlewares,
    })

    if (loopResult.outcome === 'approval') {
      await handleApproval(
        loopResult.approval,
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
      storage,
      memoryConfig,
      run.threadId,
      workingMemorySchemaName,
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
    await aiRunState.updateRun(run.runId, { status: 'failed' })
    channel.send({
      type: 'error',
      message: err instanceof Error ? err.message : String(err),
    })
    channel.send({ type: 'done' })
    channel.close()
  }
}
