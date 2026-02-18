import type {
  AIAgentInput,
  AIAgentOutput,
  PikkuAIMiddlewareHooks,
} from './ai-agent.types.js'

import { saveMessages } from './ai-agent-memory.js'
import { prepareAgentRun, type RunAIAgentParams } from './ai-agent-prepare.js'

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
    missingRpcs,
    workingMemoryJsonSchema,
    workingMemorySchemaName,
  } = await prepareAgentRun(agentName, input, params, sessionMap)

  const { singletonServices } = params
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
    const result = await agentRunner.run(runnerParams)

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
          usage: result.usage,
        })
        outputText = modResult.text
        outputMessages = modResult.messages
      }
    }

    await aiRunState.updateRun(runId, {
      status: 'completed',
      usage: { ...result.usage, model: agent.model },
    })

    return {
      runId,
      text: outputText,
      object: result.object,
      threadId,
      steps: result.steps,
      usage: result.usage,
    }
  } catch (error) {
    await aiRunState.updateRun(runId, {
      status: 'failed',
    })
    throw error
  }
}
