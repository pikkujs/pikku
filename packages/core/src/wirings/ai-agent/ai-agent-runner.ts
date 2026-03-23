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
} from './ai-agent-memory.js'
import {
  prepareAgentRun,
  resolveAgent,
  buildInstructions,
  buildToolDefs,
  type RunAIAgentParams,
} from './ai-agent-prepare.js'
import { checkForApprovals, appendStepMessages } from './ai-agent-stream.js'
import { pikkuState, getSingletonServices } from '../../pikku-state.js'
import { resolveModelConfig } from './ai-agent-model-config.js'
import { AIProviderNotConfiguredError } from '../../errors/errors.js'
import { randomUUID } from 'crypto'

export async function runAIAgent(
  agentName: string,
  input: AIAgentInput,
  params: RunAIAgentParams,
  agentSessionMap?: Map<string, string>
): Promise<AIAgentOutput> {
  const sessionMap = agentSessionMap ?? new Map<string, string>()

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
    workingMemoryJsonSchema,
    workingMemorySchemaName,
  } = await prepareAgentRun(agentName, input, params, sessionMap)

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

      accumulatedSteps.push({
        usage: stepResult.usage,
        toolCalls: stepResult.toolCalls.map((tc) => {
          const tr = stepResult.toolResults.find(
            (r) => r.toolCallId === tc.toolCallId
          )
          return {
            name: tc.toolName,
            args: tc.args as Record<string, unknown>,
            result:
              typeof tr?.result === 'string'
                ? tr.result
                : JSON.stringify(tr?.result ?? ''),
          }
        }),
      })

      if (stepResult.toolCalls.length === 0) break

      const approvalsNeeded = checkForApprovals(
        stepResult,
        runnerParams.tools,
        runId
      )
      if (approvalsNeeded.length > 0) {
        for (const approval of approvalsNeeded) {
          const toolDef = runnerParams.tools.find(
            (t) => t.name === approval.toolName
          )
          if (toolDef?.approvalDescriptionFn && !approval.reason) {
            try {
              approval.reason = await toolDef.approvalDescriptionFn(
                approval.args
              )
            } catch {
              // If description generation fails, continue without it
            }
          }
        }

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
          userMessage,
          { text: '', steps: completedStepsForSave },
          {
            workingMemoryJsonSchema,
            workingMemorySchemaName,
            logger: singletonServices.logger,
            schemaService: singletonServices.schema,
          }
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

    const finalText = lastStepResult?.text ?? ''
    const finalObject = lastStepResult?.object

    const result = {
      text: finalText,
      steps: accumulatedSteps,
    }

    const responseText = await saveMessages(
      storage,
      threadId,
      input.resourceId,
      memoryConfig,
      userMessage,
      result,
      {
        workingMemoryJsonSchema,
        workingMemorySchemaName,
        logger: singletonServices.logger,
        schemaService: singletonServices.schema,
      }
    )

    let outputText = responseText
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
    for (const mw of aiMiddlewares) {
      if (mw.onError) {
        try {
          await mw.onError(singletonServices, {
            error: error instanceof Error ? error : new Error(String(error)),
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
      errorMessage: error instanceof Error ? error.message : String(error),
    })
    throw error
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
  if (expectedAgentName && run.agentName !== expectedAgentName) {
    throw new Error(
      `Run ${runId} belongs to agent '${run.agentName}', not '${expectedAgentName}'`
    )
  }
  if (run.status !== 'suspended') {
    throw new Error(`Run ${runId} is not suspended (status: ${run.status})`)
  }

  const { agent, packageName, resolvedName } = resolveAgent(run.agentName)
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
      // Strip null values — LLMs send null for optional fields but Zod expects undefined
      const toolArgs: Record<string, any> = {}
      if (rawArgs && typeof rawArgs === 'object' && !Array.isArray(rawArgs)) {
        for (const [k, v] of Object.entries(rawArgs)) {
          if (v !== null) toolArgs[k] = v
        }
      }
      try {
        const toolResult = await matchingTool.execute(toolArgs)
        resultStr =
          typeof toolResult === 'string'
            ? toolResult
            : JSON.stringify(toolResult)
      } catch (err) {
        resultStr = `Error: ${err instanceof Error ? err.message : String(err)}`
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
    outputSchema: meta?.outputSchema
      ? pikkuState(packageName, 'misc', 'schemas').get(meta.outputSchema)
      : undefined,
  }

  try {
    const accumulatedSteps: AIAgentStep[] = []
    const totalUsage = { inputTokens: 0, outputTokens: 0 }
    let lastStepResult: AIAgentStepResult | null = null

    for (let step = 0; step < maxSteps; step++) {
      const stepResult = await agentRunner.run(runnerParams)
      lastStepResult = stepResult

      totalUsage.inputTokens += stepResult.usage.inputTokens
      totalUsage.outputTokens += stepResult.usage.outputTokens

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

      accumulatedSteps.push({
        usage: stepResult.usage,
        toolCalls: stepResult.toolCalls.map((tc) => {
          const tr = stepResult.toolResults.find(
            (r) => r.toolCallId === tc.toolCallId
          )
          return {
            name: tc.toolName,
            args: tc.args as Record<string, unknown>,
            result:
              typeof tr?.result === 'string'
                ? tr.result
                : JSON.stringify(tr?.result ?? ''),
          }
        }),
      })

      if (stepResult.toolCalls.length === 0) break

      const approvalsNeeded = checkForApprovals(
        stepResult,
        runnerParams.tools,
        run.runId
      )
      if (approvalsNeeded.length > 0) {
        for (const approval of approvalsNeeded) {
          const toolDef = runnerParams.tools.find(
            (t) => t.name === approval.toolName
          )
          if (toolDef?.approvalDescriptionFn && !approval.reason) {
            try {
              approval.reason = await toolDef.approvalDescriptionFn(
                approval.args
              )
            } catch {
              // ignore
            }
          }
        }

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
            { text: '', steps: completedSteps },
            {
              workingMemoryJsonSchema,
              workingMemorySchemaName,
              logger: singletonServices.logger,
              schemaService: singletonServices.schema,
            }
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

    const responseText = await saveMessages(
      storage,
      run.threadId,
      run.resourceId,
      memoryConfig,
      null as any,
      result,
      {
        workingMemoryJsonSchema,
        workingMemorySchemaName,
        logger: singletonServices.logger,
        schemaService: singletonServices.schema,
      }
    )

    let outputText = responseText
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
    for (const mw of aiMiddlewares) {
      if (mw.onError) {
        try {
          await mw.onError(singletonServices, {
            error: error instanceof Error ? error : new Error(String(error)),
            stepNumber: -1,
            messages: runnerParams.messages,
          })
        } catch {
          // ignore
        }
      }
    }
    await aiRunState.updateRun(run.runId, {
      status: 'failed',
      errorMessage: error instanceof Error ? error.message : String(error),
    })
    throw error
  }
}
