import type {
  AIStreamChannel,
  AIStreamEvent,
  PikkuAIMiddlewareHooks,
} from './ai-agent.types.js'
import { pikkuState } from '../../pikku-state.js'
import {
  combineChannelMiddleware,
  wrapChannelWithMiddleware,
} from '../channel/channel-middleware-runner.js'
import { randomUUID } from 'crypto'
import type { AIStorageService } from '../../services/ai-storage-service.js'

import { parseWorkingMemory } from './ai-agent-memory.js'
import {
  prepareAgentRun,
  ToolApprovalRequired,
  type RunAIAgentParams,
  type StreamAIAgentOptions,
  type StreamContext,
} from './ai-agent-prepare.js'

type PersistingChannel = AIStreamChannel & { fullText: string }

function createPersistingChannel(
  parent: AIStreamChannel,
  storage: AIStorageService | undefined,
  threadId: string
): PersistingChannel {
  let fullText = ''
  const channel: PersistingChannel = {
    channelId: parent.channelId,
    openingData: parent.openingData,
    get state() {
      return parent.state
    },
    get fullText() {
      return fullText
    },
    close: () => parent.close(),
    send: (event: AIStreamEvent) => {
      if (storage) {
        switch (event.type) {
          case 'text-delta':
            fullText += event.text
            break
          case 'tool-call':
            storage.saveMessages(threadId, [
              {
                id: randomUUID(),
                role: 'assistant',
                toolCalls: [
                  {
                    id: randomUUID(),
                    name: event.toolName,
                    args: event.args as Record<string, unknown>,
                  },
                ],
                createdAt: new Date(),
              },
            ])
            break
          case 'tool-result':
            storage.saveMessages(threadId, [
              {
                id: randomUUID(),
                role: 'tool',
                toolResults: [
                  {
                    id: randomUUID(),
                    name: event.toolName,
                    result:
                      typeof event.result === 'string'
                        ? event.result
                        : JSON.stringify(event.result),
                  },
                ],
                createdAt: new Date(),
              },
            ])
            break
          case 'done':
            if (fullText) {
              storage.saveMessages(threadId, [
                {
                  id: randomUUID(),
                  role: 'assistant',
                  content: fullText,
                  createdAt: new Date(),
                },
              ])
            }
            break
        }
      }
      parent.send(event)
    },
  }
  return channel
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

    let outputText = persistingChannel.fullText
    let outputMessages = runnerParams.messages
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
        await storage.saveWorkingMemory(input.resourceId, 'resource', parsed)
      }
    }

    if (aiRunState) {
      await aiRunState.updateRun(runId, { status: 'completed' })
    }
  } catch (err) {
    if (err instanceof ToolApprovalRequired) {
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
        toolName: err.toolName,
        args: err.args,
      })
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
  }
}
