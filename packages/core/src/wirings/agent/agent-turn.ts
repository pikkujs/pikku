import type { CoreSingletonServices } from '../../types/core.types.js'
import type { PikkuAgentMiddlewareHooks } from './agent.types.js'

/** Exactly what `modifyInput` accepts and returns, taken from the hook itself. */
type TurnInput = Pick<
  Parameters<NonNullable<PikkuAgentMiddlewareHooks['modifyInput']>>[1],
  'messages' | 'instructions'
>

/**
 * Run every `modifyInput` hook in order, threading each result into the next.
 *
 * Shared by the four places a turn starts — first turn and resume, on both the
 * streaming and non-streaming paths. `sharedNotes` is one bag per run that the
 * caller keeps, because hooks use it to pass things forward (`voiceInput`
 * leaves the transcript there for `voiceOutput`).
 */
export const applyInputMiddleware = async (
  agentMiddlewares: PikkuAgentMiddlewareHooks[],
  singletonServices: CoreSingletonServices,
  input: TurnInput,
  sharedNotes: Record<string, unknown>
): Promise<TurnInput> => {
  let { messages, instructions } = input
  for (const mw of agentMiddlewares) {
    if (!mw.modifyInput) continue
    const result = await mw.modifyInput(singletonServices, {
      messages,
      instructions,
      shared: sharedNotes,
    })
    messages = result.messages
    instructions = result.instructions
  }
  return { messages, instructions }
}

/** The step fields both agent paths hand to `afterStep`, taken from the hook. */
type StepResult = Omit<
  Parameters<NonNullable<PikkuAgentMiddlewareHooks['afterStep']>>[1],
  'stepNumber'
>

/**
 * Notify every `afterStep` hook. The payload is the step verbatim plus its
 * ordinal — a hook that wants the run's totals accumulates them itself.
 */
export const notifyAfterStep = async (
  agentMiddlewares: PikkuAgentMiddlewareHooks[],
  singletonServices: CoreSingletonServices,
  stepNumber: number,
  stepResult: StepResult
): Promise<void> => {
  for (const mw of agentMiddlewares) {
    if (!mw.afterStep) continue
    await mw.afterStep(singletonServices, {
      stepNumber,
      text: stepResult.text,
      toolCalls: stepResult.toolCalls,
      toolResults: stepResult.toolResults,
      usage: stepResult.usage,
      finishReason: stepResult.finishReason,
    })
  }
}

/**
 * The step shape kept on the run: each tool call paired with its result.
 *
 * A result is stringified unless it already is a string, because this is what
 * gets persisted and read back as history — an object there is unreadable.
 */
export const toAccumulatedStep = (stepResult: StepResult) => ({
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
      ...(tr?.error ? { error: tr.error } : {}),
    }
  }),
})

type PendingApproval = {
  toolName: string
  args: unknown
  reason?: string
}

type ToolDef = {
  name: string
  approvalDescriptionFn?: (args: any) => Promise<string> | string
}

/**
 * Fill in each approval's human-readable reason from the tool's own
 * `approvalDescriptionFn`, where it did not supply one.
 *
 * A description that throws is swallowed: the approval still has to be raised,
 * and a gate that disappears because its label failed to render is the worst
 * available outcome.
 */
export const describeApprovals = async (
  approvals: PendingApproval[],
  tools: ToolDef[]
): Promise<void> => {
  for (const approval of approvals) {
    if (approval.reason) continue
    const toolDef = tools.find((t) => t.name === approval.toolName)
    if (!toolDef?.approvalDescriptionFn) continue
    try {
      approval.reason = await toolDef.approvalDescriptionFn(approval.args)
    } catch {}
  }
}
