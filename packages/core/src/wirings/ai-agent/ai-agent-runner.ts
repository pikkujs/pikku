import type {
  AIAgentInput,
  AIAgentOutput,
  AIAgentStep,
  AIMessage,
  PikkuAIMiddlewareHooks,
} from './ai-agent.types.js'
import type { AIAgentStepResult } from '../../services/ai-agent-runner-service.js'

import { saveMessages } from './ai-agent-memory.js'
import { prepareAgentRun, type RunAIAgentParams } from './ai-agent-prepare.js'
import { getSingletonServices } from '../../pikku-state.js'
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

      const assistantMsg: AIMessage = {
        id: randomUUID(),
        role: 'assistant',
        content: stepResult.text || undefined,
        toolCalls: stepResult.toolCalls.map((tc) => ({
          id: tc.toolCallId,
          name: tc.toolName,
          args: tc.args as Record<string, unknown>,
        })),
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
              typeof tr.result === 'string'
                ? tr.result
                : JSON.stringify(tr.result),
          })),
          createdAt: new Date(),
        }
        runnerParams.messages.push(toolMsg)
      }
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
    })
    throw error
  }
}
