import type {
  AIAgentStep,
  AIMessage,
  PikkuAIMiddlewareHooks,
} from './ai-agent.types.js'
import type { AIRunStateService } from '../../services/ai-run-state-service.js'

export type RunUsage = {
  inputTokens: number
  outputTokens: number
  model?: string
}

/**
 * Everything a finished run produced, after all middleware has had its say.
 *
 * One snapshot feeds persistence and anything that grades the run, so that what
 * a scorer is shown is exactly what was stored — including the redactions.
 */
export type FinalizedRun = {
  runId: string
  agentName: string
  threadId: string
  resourceId?: string
  text: string
  steps: AIAgentStep[]
  usage: RunUsage
}

const flattenToolCalls = (
  steps: AIAgentStep[]
): NonNullable<AIAgentStep['toolCalls']> =>
  steps.flatMap((step) => step.toolCalls ?? [])

/**
 * Push a rewritten flat tool-call list back onto the steps it came from,
 * preserving the step boundaries. A hook that adds or drops calls would make
 * the boundaries meaningless, so a length change collapses them into the last
 * step rather than silently mis-attributing calls to the wrong step.
 */
const distributeToolCalls = (
  steps: AIAgentStep[],
  toolCalls: NonNullable<AIAgentStep['toolCalls']>
): AIAgentStep[] => {
  if (toolCalls.length !== flattenToolCalls(steps).length) {
    return steps.map((step, index) => ({
      ...step,
      toolCalls: index === steps.length - 1 ? toolCalls : [],
    }))
  }

  let cursor = 0
  return steps.map((step) => {
    if (!step.toolCalls) return step
    const next = toolCalls.slice(cursor, cursor + step.toolCalls.length)
    cursor += step.toolCalls.length
    return { ...step, toolCalls: next }
  })
}

/**
 * Run the `modifyOutput` chain over a finished non-streaming run.
 *
 * Reverse order, matching the input chain: the middleware registered first
 * wraps the others, so it sees the output last.
 */
export const applyOutputMiddleware = async (
  aiMiddlewares: PikkuAIMiddlewareHooks[],
  singletonServices: any,
  input: {
    text: string
    messages: AIMessage[]
    steps: AIAgentStep[]
    usage: { inputTokens: number; outputTokens: number }
  }
): Promise<{ text: string; messages: AIMessage[]; steps: AIAgentStep[] }> => {
  let text = input.text
  let messages = input.messages
  let steps = input.steps
  let toolCalls = flattenToolCalls(steps)

  for (let i = aiMiddlewares.length - 1; i >= 0; i--) {
    const mw = aiMiddlewares[i]
    if (!mw.modifyOutput) continue
    const result = await mw.modifyOutput(singletonServices, {
      text,
      messages,
      usage: {
        inputTokens: input.usage.inputTokens,
        outputTokens: input.usage.outputTokens,
      },
      toolCalls,
    })
    text = result.text
    messages = result.messages
    if (result.toolCalls) {
      toolCalls = result.toolCalls
      steps = distributeToolCalls(steps, toolCalls)
    }
  }

  return { text, messages, steps }
}

/**
 * The one place a run ends successfully.
 *
 * Every path that completes a run — streamed, non-streamed, and resumed after a
 * tool approval — goes through here, so that anything terminal is reachable
 * from all of them and cannot be reordered by a middleware author. Nothing here
 * may rewrite the run: by this point the output middleware has resolved and, on
 * the streaming path, the client already has the reply.
 */
export const finalizeAgentRun = async (
  aiRunState: AIRunStateService,
  run: FinalizedRun
): Promise<void> => {
  await aiRunState.updateRun(run.runId, {
    status: 'completed',
    ...(run.usage.model
      ? {
          usage: {
            inputTokens: run.usage.inputTokens,
            outputTokens: run.usage.outputTokens,
            model: run.usage.model,
          },
        }
      : {}),
  })
}
