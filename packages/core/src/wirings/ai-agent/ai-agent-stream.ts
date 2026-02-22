import type {
  AIStreamChannel,
  AIStreamEvent,
  AIMessage,
  AIToolCall,
  AIToolResult,
  PikkuAIMiddlewareHooks,
} from './ai-agent.types.js'
import { pikkuState } from '../../pikku-state.js'
import {
  combineChannelMiddleware,
  wrapChannelWithMiddleware,
} from '../channel/channel-middleware-runner.js'
import { randomUUID } from 'crypto'
import type { AIStorageService } from '../../services/ai-storage-service.js'

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
  ToolApprovalRequired,
  type RunAIAgentParams,
  type StreamAIAgentOptions,
  type StreamContext,
} from './ai-agent-prepare.js'
import { resolveModelConfig } from './ai-agent-model-config.js'
import type { AIRunStateService } from '../../services/ai-run-state-service.js'

type PersistingChannel = AIStreamChannel & {
  fullText: string
  flush: () => Promise<void>
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
  let outputText = persistingChannel.fullText
  let outputMessages = messages
  for (let i = aiMiddlewares.length - 1; i >= 0; i--) {
    const mw = aiMiddlewares[i]
    if (mw.modifyOutput) {
      const result = await mw.modifyOutput(singletonServices, {
        text: outputText,
        messages: outputMessages,
        usage: { inputTokens: 0, outputTokens: 0 },
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

  await aiRunState.updateRun(runId, { status: 'completed' })
}

export async function streamAIAgent(
  agentName: string,
  input: { message: string; threadId: string; resourceId: string },
  channel: AIStreamChannel,
  params: RunAIAgentParams,
  agentSessionMap?: Map<string, string>,
  options?: StreamAIAgentOptions
): Promise<void> {
  const sessionMap = agentSessionMap ?? new Map<string, string>()
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
    missingRpcs,
    workingMemorySchemaName,
  } = await prepareAgentRun(agentName, input, params, sessionMap, streamContext)

  const { singletonServices } = params
  const { aiRunState } = singletonServices
  if (!aiRunState) {
    throw new Error('AIRunStateService not available in singletonServices')
  }

  if (missingRpcs.length > 0) {
    await aiRunState.createRun({
      agentName,
      threadId,
      resourceId: input.resourceId,
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
    resourceId: input.resourceId,
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
    await agentRunner.stream(runnerParams, persistingChannel)

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
  } catch (err) {
    if (err instanceof ToolApprovalRequired) {
      await persistingChannel.flush()
      if (aiRunState) {
        await aiRunState.updateRun(runId, {
          status: 'suspended',
          suspendReason: 'approval',
          pendingApprovals: [
            {
              toolCallId: err.toolCallId,
              toolName: err.toolName,
              args: err.args,
            },
          ],
        })
      }
      channel.send({
        type: 'approval-request',
        id: err.toolCallId,
        runId,
        toolName: err.displayToolName ?? err.toolName,
        args: err.displayArgs ?? err.args,
      })
      channel.send({ type: 'done' })
      channel.close()
      return
    }

    if (aiRunState) {
      await aiRunState.updateRun(runId, { status: 'failed' })
    }
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
    agentName: string
    threadId: string
    resourceId: string
    runId: string
    toolCallId: string
    approved: boolean
  },
  channel: AIStreamChannel,
  params: RunAIAgentParams,
  options?: StreamAIAgentOptions
): Promise<void> {
  const { singletonServices } = params
  const { aiRunState } = singletonServices
  if (!aiRunState) {
    throw new Error('AIRunStateService not available in singletonServices')
  }

  const run = await aiRunState.getRun(input.runId)
  if (!run) {
    throw new Error(`Run not found: ${input.runId}`)
  }
  if (run.status !== 'suspended' || run.suspendReason !== 'approval') {
    throw new Error(`Run ${input.runId} is not suspended for approval`)
  }

  const pending = run.pendingApprovals?.find(
    (a) => a.toolCallId === input.toolCallId
  )
  if (!pending) {
    throw new Error(
      `No pending approval for toolCallId ${input.toolCallId} on run ${input.runId}`
    )
  }

  const { agent, packageName, resolvedName } = resolveAgent(input.agentName)
  const { storage } = resolveMemoryServices(agent, singletonServices)
  const memoryConfig = agent.memory
  const agentRunner = singletonServices.aiAgentRunner
  if (!agentRunner) {
    throw new Error('AIAgentRunnerService not available in singletonServices')
  }

  await aiRunState.resolveApproval(
    input.toolCallId,
    input.approved ? 'approved' : 'denied'
  )

  if (!input.approved) {
    await aiRunState.updateRun(input.runId, { status: 'completed' })
    if (storage) {
      await storage.saveMessages(input.threadId, [
        {
          id: randomUUID(),
          role: 'tool',
          toolResults: [
            {
              id: input.toolCallId,
              name: pending.toolName,
              result: 'Tool call denied by user',
            },
          ],
          createdAt: new Date(),
        },
      ])
    }
    channel.send({
      type: 'text-delta',
      text: `Tool "${pending.toolName}" was denied.`,
    })
    channel.send({ type: 'done' })
    channel.close()
    return
  }

  const streamContext: StreamContext = { channel, options }
  const { tools } = buildToolDefs(
    singletonServices,
    params,
    new Map<string, string>(),
    input.resourceId,
    resolvedName,
    packageName,
    { channel, options: { ...options, requiresToolApproval: false } }
  )

  const matchingTool = tools.find((t) => t.name === pending.toolName)
  if (!matchingTool) {
    throw new Error(`Tool "${pending.toolName}" not found in agent definition`)
  }

  const toolArgs =
    typeof pending.args === 'string' ? JSON.parse(pending.args) : pending.args
  const { toolApprovalReason: _ignored, ...cleanArgs } = toolArgs as Record<
    string,
    unknown
  >

  let toolResult: unknown
  try {
    toolResult = await matchingTool.execute(cleanArgs)
  } catch (execErr) {
    toolResult = `Error: ${execErr instanceof Error ? execErr.message : String(execErr)}`
  }

  const resultStr =
    typeof toolResult === 'string' ? toolResult : JSON.stringify(toolResult)
  if (storage) {
    await storage.saveMessages(input.threadId, [
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

  await aiRunState.updateRun(input.runId, { status: 'running' })

  const agentsMeta = pikkuState(packageName, 'agent', 'agentsMeta')
  const meta = agentsMeta[resolvedName]
  const workingMemorySchemaName = meta?.workingMemorySchema ?? null

  const messages = storage
    ? await storage.getMessages(input.threadId, {
        lastN: memoryConfig?.lastMessages ?? 20,
      })
    : []

  const workingMemoryJsonSchema = workingMemorySchemaName
    ? pikkuState(packageName, 'misc', 'schemas').get(workingMemorySchemaName)
    : undefined

  const contextMessages = await loadContextMessages(
    memoryConfig,
    storage,
    { message: '', threadId: input.threadId, resourceId: input.resourceId },
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
    `stream:${input.agentName}`,
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
    input.threadId
  )

  const resumeTools = buildToolDefs(
    singletonServices,
    params,
    new Map<string, string>(),
    input.resourceId,
    resolvedName,
    packageName,
    streamContext
  ).tools

  const resolved = resolveModelConfig(resolvedName, agent)

  const runnerParams = {
    model: resolved.model,
    temperature: resolved.temperature,
    instructions: modifiedInstructions,
    messages: modifiedMessages,
    tools: resumeTools,
    maxSteps: resolved.maxSteps ?? 10,
    toolChoice: (agent.toolChoice ?? 'auto') as 'auto' | 'required' | 'none',
    outputSchema: meta?.outputSchema
      ? pikkuState(packageName, 'misc', 'schemas').get(meta.outputSchema)
      : undefined,
  }

  try {
    await agentRunner.stream(runnerParams, persistingChannel)

    await postStreamCleanup(
      persistingChannel,
      aiMiddlewares,
      singletonServices,
      storage,
      memoryConfig,
      input.threadId,
      workingMemorySchemaName,
      runnerParams.messages,
      aiRunState,
      input.runId
    )
  } catch (err) {
    if (err instanceof ToolApprovalRequired) {
      await persistingChannel.flush()
      await aiRunState.updateRun(input.runId, {
        status: 'suspended',
        suspendReason: 'approval',
        pendingApprovals: [
          {
            toolCallId: err.toolCallId,
            toolName: err.toolName,
            args: err.args,
          },
        ],
      })
      channel.send({
        type: 'approval-request',
        id: err.toolCallId,
        runId: input.runId,
        toolName: err.toolName,
        args: err.args,
      })
      channel.send({ type: 'done' })
      channel.close()
      return
    }

    await aiRunState.updateRun(input.runId, { status: 'failed' })
    channel.send({
      type: 'error',
      message: err instanceof Error ? err.message : String(err),
    })
    channel.send({ type: 'done' })
    channel.close()
  }
}
