import type {
  AgentInput,
  AgentOutput,
  AgentStep,
  AgentMemoryConfig,
  CoreAgent,
  PikkuAgentMiddlewareHooks,
  AgentRunState,
} from './agent.types.js'
import type {
  AgentStepResult,
  AgentRunnerParams,
  AgentRunnerService,
} from '../../services/agent-runner-service.js'
import type { AgentStorageService } from '../../services/agent-storage-service.js'
import type { AgentRunStateService } from '../../services/agent-run-state-service.js'

import {
  saveMessages,
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
  resolveOwnerResourceId,
  agentSessionScope,
  assertResourcePrincipalOwner,
  assertAgentAuthorized,
  type RunAgentParams,
} from './agent-prepare.js'
import { checkForApprovals, appendStepMessages } from './agent-stream.js'
import {
  AgentInterruptedError,
  isAbortError,
  persistOrphanedToolResults,
  registerInterruptibleRun,
  trackInterruptNote,
  trackToolExecution,
} from './agent-interrupt.js'
import { pikkuState, getSingletonServices } from '../../pikku-state.js'
import {
  applyInputMiddleware,
  describeApprovals,
  notifyAfterStep,
  toAccumulatedStep,
} from './agent-turn.js'
import {
  applyOutputMiddleware,
  finalizeAgentRun,
  lastUserMessageText,
} from './agent-finalize.js'
import { resolveModelConfig } from './agent-model-config.js'
import { AIProviderNotConfiguredError } from '../../errors/errors.js'
import { deniedToolResult, randomUUID } from './agent-utils.js'

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

export async function runAgent(
  agentName: string,
  input: AgentInput,
  params: RunAgentParams,
  agentSessionMap?: Map<string, string>
): Promise<AgentOutput> {
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
  const { agentRunState } = singletonServices
  if (!agentRunState) {
    throw new Error('AgentRunStateService not available in singletonServices')
  }

  if (missingRpcs.length > 0) {
    const runId = await agentRunState.createRun({
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

  // knowledge: decisions/internals/thread-history-records-the-transcript-not-the-audio.md
  const lastModified = modifiedMessages[modifiedMessages.length - 1]
  const persistedUserMessage =
    lastModified?.id === userMessage.id ? lastModified : userMessage

  const runId = await agentRunState.createRun({
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
    const accumulatedSteps: AgentStep[] = []
    const totalUsage = { inputTokens: 0, outputTokens: 0 }
    let lastStepResult: AgentStepResult | null = null

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

      await notifyAfterStep(
        agentMiddlewares,
        singletonServices,
        step,
        stepResult
      )

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

        await agentRunState.updateRun(runId, {
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

    const { text: outputText, steps: outputSteps } =
      await applyOutputMiddleware(agentMiddlewares, singletonServices, {
        text: finalText,
        messages: runnerParams.messages,
        steps: result.steps,
        usage: totalUsage,
      })

    await saveMessages(
      storage,
      threadId,
      input.resourceId,
      memoryConfig,
      persistedUserMessage,
      {
        text: outputText,
        steps: outputSteps,
        uiSpec: structuredOutput.uiSpec,
      }
    )

    await finalizeAgentRun(agentRunState, {
      runId,
      agentName,
      threadId,
      resourceId: input.resourceId,
      input: lastUserMessageText(runnerParams.messages),
      text: outputText,
      steps: outputSteps,
      usage: { ...totalUsage, model: agent.model },
    })

    return {
      runId,
      text: outputText,
      object: finalObject,
      threadId,
      steps: outputSteps,
      usage: totalUsage,
    }
  } catch (error) {
    // knowledge: decisions/internals/an-agent-interrupt-is-not-a-failure.md
    const interruption = interruptHandle.interruption
    if (interruption || isAbortError(error)) {
      await agentRunState.updateRun(runId, { status: 'interrupted' })
      if (storage) {
        trackInterruptNote(
          threadId,
          persistOrphanedToolResults(interruptHandle, storage, threadId)
        )
      }
      throw new AgentInterruptedError(runId, interruption ?? { reason: 'user' })
    }
    for (const mw of agentMiddlewares) {
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
    await agentRunState.updateRun(runId, {
      status: 'failed',
      errorMessage: error instanceof Error ? error.message : String(error),
    })
    throw error
  } finally {
    interruptHandle.release()
  }
}

export async function resumeAgentSync(
  runId: string,
  approvals: { toolCallId: string; approved: boolean }[],
  params: RunAgentParams,
  expectedAgentName?: string
): Promise<AgentOutput> {
  const singletonServices = getSingletonServices()
  const { agentRunState } = singletonServices
  if (!agentRunState) {
    throw new Error('AgentRunStateService not available in singletonServices')
  }

  const run = await agentRunState.getRun(runId)
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
  const agentRunner = singletonServices.agentRunner
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

  // The read above is not a claim — concurrent resumes all see the same pending
  // list. `resolveApproval` is the claim, and only the caller it returns true
  // for may run the tool.
  const claimedIds = new Set<string>()
  for (const { toolCallId, approved } of approvals) {
    const claimed = await agentRunState.resolveApproval(
      toolCallId,
      approved ? 'approved' : 'denied'
    )
    if (claimed) {
      claimedIds.add(toolCallId)
    }
  }

  if (approvals.length > 0 && claimedIds.size === 0) {
    throw new Error(
      `Approvals for run ${runId} were already resolved by another caller`
    )
  }

  const { tools } = await buildToolDefs(
    params,
    new Map<string, string>(),
    run.resourceId,
    resolvedName,
    packageName,
    undefined,
    agent.agentMiddleware ?? []
  )

  const toolCallMessages: {
    toolCallId: string
    toolName: string
    args: any
    result: string
    error?: string
  }[] = []

  for (const pending of savedPendingApprovals) {
    if (pending.type !== 'tool-call') continue

    const toolCallId = pending.toolCallId
    if (!claimedIds.has(toolCallId)) continue

    let resultStr: string
    let toolError: string | undefined

    if (rejectedIds.has(toolCallId)) {
      resultStr = deniedToolResult()
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
          toolError = err instanceof Error ? err.message : String(err)
          resultStr = `Error: ${toolError}`
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
      ...(toolError ? { error: toolError } : {}),
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

  await agentRunState.updateRun(runId, { status: 'running' })

  return continueAfterToolResultSync(
    run,
    agent,
    packageName,
    resolvedName,
    storage,
    memoryConfig,
    agentRunner,
    params,
    agentRunState,
    // The approved tools were executed here, before the model was re-entered,
    // so they belong to the run's step record — otherwise a tool that failed
    // after approval leaves no trace on the run at all.
    toolCallMessages.length > 0
      ? {
          usage: { inputTokens: 0, outputTokens: 0 },
          toolCalls: toolCallMessages.map((tc) => ({
            name: tc.toolName,
            args: (tc.args ?? {}) as Record<string, unknown>,
            result: tc.result,
            ...(tc.error ? { error: tc.error } : {}),
          })),
        }
      : undefined
  )
}

async function continueAfterToolResultSync(
  run: AgentRunState,
  agent: CoreAgent,
  packageName: string | null,
  resolvedName: string,
  storage: AgentStorageService | undefined,
  memoryConfig: AgentMemoryConfig | undefined,
  agentRunner: AgentRunnerService,
  params: RunAgentParams,
  agentRunState: AgentRunStateService,
  resumedToolStep?: AgentStep
): Promise<AgentOutput> {
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

  const { tools: resumeTools } = await buildToolDefs(
    params,
    new Map<string, string>(),
    run.resourceId,
    resolvedName,
    packageName,
    undefined,
    agentMiddlewares
  )

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
    agentId: run.agentName,
  }

  // A resumed run keeps its original runId, so the handle registered for the
  // first leg is long gone — an approval that kicks off more generation has to
  // be interruptible on its own terms.
  const interruptHandle = registerInterruptibleRun(run.runId)
  runnerParams.abortSignal = interruptHandle.signal
  runnerParams.tools = trackToolExecution(runnerParams.tools, interruptHandle)

  try {
    // Kept out of `accumulatedSteps` deliberately: that array drives
    // `saveMessages`, and the approved tool's messages were already written to
    // the thread before the model was re-entered. It belongs to the run's step
    // record, not to persistence.
    const withResumedStep = (steps: AgentStep[]): AgentStep[] =>
      resumedToolStep ? [resumedToolStep, ...steps] : steps

    const accumulatedSteps: AgentStep[] = []
    const totalUsage = { inputTokens: 0, outputTokens: 0 }
    let lastStepResult: AgentStepResult | null = null

    for (let step = 0; step < maxSteps; step++) {
      const stepResult = await agentRunner.run(runnerParams)
      lastStepResult = stepResult

      totalUsage.inputTokens += stepResult.usage.inputTokens
      totalUsage.outputTokens += stepResult.usage.outputTokens

      await notifyAfterStep(
        agentMiddlewares,
        singletonServices,
        step,
        stepResult
      )

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

        await agentRunState.updateRun(run.runId, {
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
          steps: withResumedStep(accumulatedSteps),
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

    const { text: outputText, steps: outputSteps } =
      await applyOutputMiddleware(agentMiddlewares, singletonServices, {
        text: finalText,
        messages: runnerParams.messages,
        steps: withResumedStep(result.steps),
        usage: totalUsage,
      })

    await saveMessages(
      storage,
      run.threadId,
      run.resourceId,
      memoryConfig,
      null,
      {
        text: outputText,
        // The approved tool's messages were written before the model was
        // re-entered, so only the steps this leg generated are persisted here.
        steps: accumulatedSteps,
      }
    )

    await finalizeAgentRun(agentRunState, {
      runId: run.runId,
      agentName: resolvedName,
      threadId: run.threadId,
      resourceId: run.resourceId,
      input: lastUserMessageText(runnerParams.messages),
      text: outputText,
      steps: outputSteps,
      usage: { ...totalUsage, model: agent.model },
    })

    return {
      runId: run.runId,
      text: outputText,
      object: finalObject,
      threadId: run.threadId,
      steps: outputSteps,
      usage: totalUsage,
    }
  } catch (error) {
    const interruption = interruptHandle.interruption
    if (interruption || isAbortError(error)) {
      await agentRunState.updateRun(run.runId, { status: 'interrupted' })
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
    for (const mw of agentMiddlewares) {
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
    await agentRunState.updateRun(run.runId, {
      status: 'failed',
      errorMessage: error instanceof Error ? error.message : String(error),
    })
    throw error
  } finally {
    interruptHandle.release()
  }
}
