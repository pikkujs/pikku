import type {
  AIAgentInput,
  AIAgentOutput,
  AIAgentStep,
  AIAgentMemoryConfig,
  CoreAIAgent,
  PikkuAIMiddlewareHooks,
  AgentRunState,
} from './ai-agent.types.js'
import type {
  AIAgentStepResult,
  AIAgentRunnerParams,
  AIAgentRunnerService,
} from '../../services/ai-agent-runner-service.js'
import type { AIStorageService } from '../../services/ai-storage-service.js'
import type { AIRunStateService } from '../../services/ai-run-state-service.js'

import {
  saveMessages,
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
  resolveOwnerResourceId,
  agentSessionScope,
  assertResourcePrincipalOwner,
  assertAgentAuthorized,
  type RunAIAgentParams,
} from './ai-agent-prepare.js'
import { checkForApprovals, appendStepMessages } from './ai-agent-stream.js'
import {
  AgentInterruptedError,
  isAbortError,
  persistOrphanedToolResults,
  registerInterruptibleRun,
  trackInterruptNote,
  trackToolExecution,
} from './ai-agent-interrupt.js'
import { pikkuState, getSingletonServices } from '../../pikku-state.js'
import {
  applyInputMiddleware,
  describeApprovals,
  notifyAfterStep,
  toAccumulatedStep,
} from './ai-agent-turn.js'
import { resolveModelConfig } from './ai-agent-model-config.js'
import { AIProviderNotConfiguredError } from '../../errors/errors.js'
import { randomUUID } from './ai-agent-utils.js'

function stripNulls(obj: unknown): unknown {
  if (obj === null) return undefined
  if (Array.isArray(obj)) return obj.map(stripNulls)
  if (typeof obj !== 'object') return obj
  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    if (value !== null) {
      result[key] = stripNulls(value)
    }
  }
  return result
}

function extractStructuredAssistantOutput(object: unknown): {
  text: string | null
  uiSpec: unknown | null
} {
  if (!object || typeof object !== 'object') {
    return { text: null, uiSpec: null }
  }

  const record = object as Record<string, unknown>
  return {
    text: typeof record.text === 'string' ? record.text : null,
    uiSpec: record.ui ?? null,
  }
}

export async function runAIAgent(
  agentName: string,
  input: AIAgentInput,
  params: RunAIAgentParams,
  agentSessionMap?: Map<string, string>
): Promise<AIAgentOutput> {
  const sessionMap = agentSessionMap ?? new Map<string, string>()

  input = {
    ...input,
    resourceId: resolveOwnerResourceId(
      params,
      agentSessionScope(agentName),
      input.resourceId
    ),
  }

  const {
    agent,
    agentRunner,
    storage,
    memoryConfig,
    threadId,
    userMessage,
    runnerParams,
    maxSteps,
    missingRpcs,
    workingMemorySchemaName,
  } = await prepareAgentRun(agentName, input, params, sessionMap)

  runnerParams.agentId = agentName

  const singletonServices = getSingletonServices()
  const { aiRunState } = singletonServices
  if (!aiRunState) {
    throw new Error('AIRunStateService not available in singletonServices')
  }

  if (missingRpcs.length > 0) {
    const runId = await aiRunState.createRun({
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
    return {
      runId,
      text: '',
      threadId,
      steps: [],
      usage: { inputTokens: 0, outputTokens: 0 },
    }
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

  // One bag per run, shared by every middleware — see PikkuAIMiddlewareHooks.
  const sharedNotes: Record<string, unknown> = {}

  const { messages: modifiedMessages, instructions: modifiedInstructions } =
    await applyInputMiddleware(
      aiMiddlewares,
      singletonServices,
      {
        messages: runnerParams.messages,
        instructions: runnerParams.instructions,
      },
      sharedNotes
    )
  runnerParams.messages = modifiedMessages
  runnerParams.instructions = modifiedInstructions

  // knowledge: decisions/internals/thread-history-records-the-transcript-not-the-audio.md
  const lastModified = modifiedMessages[modifiedMessages.length - 1]
  const persistedUserMessage =
    lastModified?.id === userMessage.id ? lastModified : userMessage

  const runId = await aiRunState.createRun({
    agentName,
    threadId,
    resourceId: input.resourceId,
    status: 'running',
    usage: { inputTokens: 0, outputTokens: 0, model: agent.model },
    createdAt: new Date(),
    updatedAt: new Date(),
  })

  // knowledge: decisions/internals/a-non-streaming-agent-run-registers-with-airunstate-too.md
  const interruptHandle = registerInterruptibleRun(runId)
  runnerParams.abortSignal = interruptHandle.signal
  runnerParams.tools = trackToolExecution(runnerParams.tools, interruptHandle)

  try {
    const accumulatedSteps: AIAgentStep[] = []
    const totalUsage = { inputTokens: 0, outputTokens: 0 }
    let lastStepResult: AIAgentStepResult | null = null

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

      const stepResult = await agentRunner.run(runnerParams)
      lastStepResult = stepResult

      totalUsage.inputTokens += stepResult.usage.inputTokens
      totalUsage.outputTokens += stepResult.usage.outputTokens

      await notifyAfterStep(aiMiddlewares, singletonServices, step, stepResult)

      accumulatedSteps.push(toAccumulatedStep(stepResult))

      if (stepResult.toolCalls.length === 0) break

      const approvalsNeeded = checkForApprovals(stepResult, runnerParams.tools)
      if (approvalsNeeded.length > 0) {
        await describeApprovals(approvalsNeeded, runnerParams.tools)

        const pendingApprovals = approvalsNeeded.map((a) =>
          a.agentRunId
            ? {
                type: 'agent-call' as const,
                toolCallId: a.toolCallId,
                agentName: a.toolName,
                agentRunId: a.agentRunId,
                displayToolName: a.displayToolName ?? a.toolName,
                displayArgs: a.displayArgs ?? a.args,
              }
            : {
                type: 'tool-call' as const,
                toolCallId: a.toolCallId,
                toolName: a.toolName,
                args: a.args,
              }
        )

        const completedStepsForSave = accumulatedSteps.slice(0, -1)
        await saveMessages(
          storage,
          threadId,
          input.resourceId,
          memoryConfig,
          persistedUserMessage,
          { text: '', steps: completedStepsForSave }
        )

        if (storage) {
          await storage.saveMessages(threadId, [
            {
              id: randomUUID(),
              role: 'assistant',
              toolCalls: stepResult.toolCalls.map((tc) => ({
                id: tc.toolCallId,
                name: tc.toolName,
                args: tc.args as Record<string, unknown>,
              })),
              createdAt: new Date(),
            },
          ])
        }

        await aiRunState.updateRun(runId, {
          status: 'suspended',
          suspendReason: 'approval',
          pendingApprovals,
          usage: { ...totalUsage, model: agent.model },
        })

        const suspendedFinalText = lastStepResult?.text ?? ''
        return {
          runId,
          text: suspendedFinalText,
          threadId,
          steps: accumulatedSteps,
          usage: totalUsage,
          status: 'suspended',
          pendingApprovals: approvalsNeeded.map((a) => ({
            toolCallId: a.toolCallId,
            toolName: a.displayToolName ?? a.toolName,
            args: a.displayArgs ?? a.args,
            reason: a.reason,
            runId,
          })),
        }
      }

      appendStepMessages(runnerParams, stepResult)
    }

    const finalObject = lastStepResult?.object
    const structuredOutput = extractStructuredAssistantOutput(finalObject)
    const finalText = structuredOutput.text ?? lastStepResult?.text ?? ''

    const result = {
      text: finalText,
      steps: accumulatedSteps,
    }

    let outputText = finalText
    let outputMessages = runnerParams.messages
    for (let i = aiMiddlewares.length - 1; i >= 0; i--) {
      const mw = aiMiddlewares[i]
      if (mw.modifyOutput) {
        const modResult = await mw.modifyOutput(singletonServices, {
          text: outputText,
          messages: outputMessages,
          usage: totalUsage,
        })
        outputText = modResult.text
        outputMessages = modResult.messages
      }
    }

    await saveMessages(
      storage,
      threadId,
      input.resourceId,
      memoryConfig,
      persistedUserMessage,
      {
        ...result,
        text: outputText,
        uiSpec: structuredOutput.uiSpec,
      }
    )

    await aiRunState.updateRun(runId, {
      status: 'completed',
      usage: { ...totalUsage, model: agent.model },
    })

    return {
      runId,
      text: outputText,
      object: finalObject,
      threadId,
      steps: accumulatedSteps,
      usage: totalUsage,
    }
  } catch (error) {
    // knowledge: decisions/internals/an-agent-interrupt-is-not-a-failure.md
    const interruption = interruptHandle.interruption
    if (interruption || isAbortError(error)) {
      await aiRunState.updateRun(runId, { status: 'interrupted' })
      if (storage) {
        trackInterruptNote(
          threadId,
          persistOrphanedToolResults(interruptHandle, storage, threadId)
        )
      }
      throw new AgentInterruptedError(runId, interruption ?? { reason: 'user' })
    }
    for (const mw of aiMiddlewares) {
      if (mw.onError) {
        try {
          await mw.onError(singletonServices, {
            error: error instanceof Error ? error : new Error(String(error)),
            stepNumber: -1,
            messages: runnerParams.messages,
          })
        } catch {}
      }
    }
    await aiRunState.updateRun(runId, {
      status: 'failed',
      errorMessage: error instanceof Error ? error.message : String(error),
    })
    throw error
  } finally {
    interruptHandle.release()
  }
}

export async function resumeAIAgentSync(
  runId: string,
  approvals: { toolCallId: string; approved: boolean }[],
  params: RunAIAgentParams,
  expectedAgentName?: string
): Promise<AIAgentOutput> {
  const singletonServices = getSingletonServices()
  const { aiRunState } = singletonServices
  if (!aiRunState) {
    throw new Error('AIRunStateService not available in singletonServices')
  }

  const run = await aiRunState.getRun(runId)
  if (!run) throw new Error(`No run found for runId ${runId}`)
  assertResourcePrincipalOwner(
    params,
    agentSessionScope(run.agentName),
    run.resourceId,
    'run'
  )
  if (expectedAgentName && run.agentName !== expectedAgentName) {
    throw new Error(
      `Run ${runId} belongs to agent '${run.agentName}', not '${expectedAgentName}'`
    )
  }
  if (run.status !== 'suspended') {
    throw new Error(`Run ${runId} is not suspended (status: ${run.status})`)
  }

  const { agent, packageName, resolvedName } = resolveAgent(run.agentName)

  await assertAgentAuthorized(agent, params, packageName)

  const { storage } = resolveMemoryServices(agent, singletonServices)
  const memoryConfig = agent.memory
  const agentRunner = singletonServices.aiAgentRunner
  if (!agentRunner) {
    throw new AIProviderNotConfiguredError()
  }

  const approvedIds = new Set(
    approvals.filter((a) => a.approved).map((a) => a.toolCallId)
  )
  const rejectedIds = new Set(
    approvals.filter((a) => !a.approved).map((a) => a.toolCallId)
  )

  const savedPendingApprovals = [...(run.pendingApprovals ?? [])]

  for (const { toolCallId, approved } of approvals) {
    await aiRunState.resolveApproval(
      toolCallId,
      approved ? 'approved' : 'denied'
    )
  }

  const { tools } = await buildToolDefs(
    params,
    new Map<string, string>(),
    run.resourceId,
    resolvedName,
    packageName,
    undefined,
    agent.aiMiddleware ?? []
  )

  const toolCallMessages: {
    toolCallId: string
    toolName: string
    args: any
    result: string
  }[] = []

  for (const pending of savedPendingApprovals) {
    if (pending.type !== 'tool-call') continue

    const toolCallId = pending.toolCallId
    let resultStr: string

    if (rejectedIds.has(toolCallId)) {
      resultStr =
        'The user explicitly declined this action. Inform them that it was declined and do not retry.'
    } else if (approvedIds.has(toolCallId)) {
      const matchingTool = tools.find((t) => t.name === pending.toolName)
      if (!matchingTool) {
        throw new Error(
          `Tool "${pending.toolName}" not found in agent definition`
        )
      }
      const rawArgs =
        typeof pending.args === 'string'
          ? JSON.parse(pending.args)
          : pending.args
      const toolArgs = stripNulls(rawArgs) ?? {}
      try {
        const toolResult = await matchingTool.execute(toolArgs)
        resultStr =
          typeof toolResult === 'string'
            ? toolResult
            : JSON.stringify(toolResult)
      } catch (err: any) {
        if (err?.payload?.error === 'missing_credential') {
          resultStr = JSON.stringify(err.payload)
        } else {
          resultStr = `Error: ${err instanceof Error ? err.message : String(err)}`
        }
      }
    } else {
      continue
    }

    toolCallMessages.push({
      toolCallId,
      toolName: pending.toolName,
      args:
        typeof pending.args === 'string'
          ? JSON.parse(pending.args)
          : pending.args,
      result: resultStr,
    })
  }

  if (storage && toolCallMessages.length > 0) {
    await storage.saveMessages(run.threadId, [
      {
        id: randomUUID(),
        role: 'tool',
        toolResults: toolCallMessages.map((tc) => ({
          id: tc.toolCallId,
          name: tc.toolName,
          result: tc.result,
        })),
        createdAt: new Date(),
      },
    ])
  }

  await aiRunState.updateRun(runId, { status: 'running' })

  return continueAfterToolResultSync(
    run,
    agent,
    packageName,
    resolvedName,
    storage,
    memoryConfig,
    agentRunner,
    params,
    aiRunState
  )
}

async function continueAfterToolResultSync(
  run: AgentRunState,
  agent: CoreAIAgent,
  packageName: string | null,
  resolvedName: string,
  storage: AIStorageService | undefined,
  memoryConfig: AIAgentMemoryConfig | undefined,
  agentRunner: AIAgentRunnerService,
  params: RunAIAgentParams,
  aiRunState: AIRunStateService
): Promise<AIAgentOutput> {
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
  // One bag per run, shared by every middleware — see PikkuAIMiddlewareHooks.
  const sharedNotes: Record<string, unknown> = {}

  const { messages: modifiedMessages, instructions: modifiedInstructions } =
    await applyInputMiddleware(
      aiMiddlewares,
      singletonServices,
      { messages: trimmedMessages, instructions: instructions },
      sharedNotes
    )

  const { tools: resumeTools } = await buildToolDefs(
    params,
    new Map<string, string>(),
    run.resourceId,
    resolvedName,
    packageName,
    undefined,
    aiMiddlewares
  )

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
    providerOptions: agent.providerOptions,
    outputSchema: meta?.outputSchema
      ? pikkuState(packageName, 'misc', 'schemas').get(meta.outputSchema)
      : undefined,
    agentId: run.agentName,
  }

  // A resumed run keeps its original runId, so the handle registered for the
  // first leg is long gone — an approval that kicks off more generation has to
  // be interruptible on its own terms.
  const interruptHandle = registerInterruptibleRun(run.runId)
  runnerParams.abortSignal = interruptHandle.signal
  runnerParams.tools = trackToolExecution(runnerParams.tools, interruptHandle)

  try {
    const accumulatedSteps: AIAgentStep[] = []
    const totalUsage = { inputTokens: 0, outputTokens: 0 }
    let lastStepResult: AIAgentStepResult | null = null

    for (let step = 0; step < maxSteps; step++) {
      const stepResult = await agentRunner.run(runnerParams)
      lastStepResult = stepResult

      totalUsage.inputTokens += stepResult.usage.inputTokens
      totalUsage.outputTokens += stepResult.usage.outputTokens

      await notifyAfterStep(aiMiddlewares, singletonServices, step, stepResult)

      accumulatedSteps.push(toAccumulatedStep(stepResult))

      if (stepResult.toolCalls.length === 0) break

      const approvalsNeeded = checkForApprovals(stepResult, runnerParams.tools)
      if (approvalsNeeded.length > 0) {
        await describeApprovals(approvalsNeeded, runnerParams.tools)

        const pendingApprovals = approvalsNeeded.map((a) =>
          a.agentRunId
            ? {
                type: 'agent-call' as const,
                toolCallId: a.toolCallId,
                agentName: a.toolName,
                agentRunId: a.agentRunId,
                displayToolName: a.displayToolName ?? a.toolName,
                displayArgs: a.displayArgs ?? a.args,
              }
            : {
                type: 'tool-call' as const,
                toolCallId: a.toolCallId,
                toolName: a.toolName,
                args: a.args,
              }
        )

        const completedSteps = accumulatedSteps.slice(0, -1)
        if (completedSteps.length > 0) {
          await saveMessages(
            storage,
            run.threadId,
            run.resourceId,
            memoryConfig,
            null,
            { text: '', steps: completedSteps }
          )
        }

        if (storage) {
          await storage.saveMessages(run.threadId, [
            {
              id: randomUUID(),
              role: 'assistant',
              toolCalls: stepResult.toolCalls.map((tc) => ({
                id: tc.toolCallId,
                name: tc.toolName,
                args: tc.args as Record<string, unknown>,
              })),
              createdAt: new Date(),
            },
          ])
        }

        await aiRunState.updateRun(run.runId, {
          status: 'suspended',
          suspendReason: 'approval',
          pendingApprovals,
          usage: { ...totalUsage, model: agent.model },
        })

        const suspendedText = lastStepResult?.text ?? ''
        return {
          runId: run.runId,
          text: suspendedText,
          threadId: run.threadId,
          steps: accumulatedSteps,
          usage: totalUsage,
          status: 'suspended',
          pendingApprovals: approvalsNeeded.map((a) => ({
            toolCallId: a.toolCallId,
            toolName: a.displayToolName ?? a.toolName,
            args: a.displayArgs ?? a.args,
            reason: a.reason,
            runId: run.runId,
          })),
        }
      }

      appendStepMessages(runnerParams, stepResult)
    }

    const finalText = lastStepResult?.text ?? ''
    const finalObject = lastStepResult?.object

    const result = {
      text: finalText,
      steps: accumulatedSteps,
    }

    let outputText = finalText
    let outputMessages = runnerParams.messages
    for (let i = aiMiddlewares.length - 1; i >= 0; i--) {
      const mw = aiMiddlewares[i]
      if (mw.modifyOutput) {
        const modResult = await mw.modifyOutput(singletonServices, {
          text: outputText,
          messages: outputMessages,
          usage: totalUsage,
        })
        outputText = modResult.text
        outputMessages = modResult.messages
      }
    }

    await saveMessages(
      storage,
      run.threadId,
      run.resourceId,
      memoryConfig,
      null,
      {
        ...result,
        text: outputText,
      }
    )

    await aiRunState.updateRun(run.runId, {
      status: 'completed',
      usage: { ...totalUsage, model: agent.model },
    })

    return {
      runId: run.runId,
      text: outputText,
      object: finalObject,
      threadId: run.threadId,
      steps: accumulatedSteps,
      usage: totalUsage,
    }
  } catch (error) {
    const interruption = interruptHandle.interruption
    if (interruption || isAbortError(error)) {
      await aiRunState.updateRun(run.runId, { status: 'interrupted' })
      if (storage) {
        trackInterruptNote(
          run.threadId,
          persistOrphanedToolResults(interruptHandle, storage, run.threadId)
        )
      }
      throw new AgentInterruptedError(
        run.runId,
        interruption ?? { reason: 'user' }
      )
    }
    for (const mw of aiMiddlewares) {
      if (mw.onError) {
        try {
          await mw.onError(singletonServices, {
            error: error instanceof Error ? error : new Error(String(error)),
            stepNumber: -1,
            messages: runnerParams.messages,
          })
        } catch {}
      }
    }
    await aiRunState.updateRun(run.runId, {
      status: 'failed',
      errorMessage: error instanceof Error ? error.message : String(error),
    })
    throw error
  } finally {
    interruptHandle.release()
  }
}
