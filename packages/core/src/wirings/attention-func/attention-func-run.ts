import { pikkuState } from '../../pikku-state.js'
import type { PikkuWire } from '../../types/core.types.js'
import { attentionResultStore } from './attention-func-store.js'
import type {
  AttentionFuncInput,
  AttentionResult,
  AttentionScore,
  PikkuAttentionFunc,
} from './attention-func.types.js'

/** How many times the get step is tried before the run stores "couldn't check". */
export const ATTENTION_CHECK_RETRIES = 3

/** The registered name of the workflow that runs one attention func. */
export const attentionWorkflowName = (widget: string) => `attention.${widget}`
/** The registered name of the get step: it runs the func and nothing else. */
export const attentionCheckName = (widget: string) =>
  `${attentionWorkflowName(widget)}.check`
/** The registered name of the step that stores what the get step found. */
export const attentionStoreName = (widget: string) =>
  `${attentionWorkflowName(widget)}.store`

/** What the get step hands the store step: the score, or why there is none. */
export type AttentionOutcome =
  | { status: 'quiet' }
  | { status: 'attention'; score: AttentionScore }
  | { status: 'failed'; error: string }

const assertScore = (widget: string, value: unknown) => {
  const score = (value as { score?: unknown } | null)?.score
  if (typeof score !== 'number' || !(score >= 0 && score <= 1)) {
    throw new Error(
      `Attention func '${widget}' returned a score of ${JSON.stringify(score)} — a score is a number from 0 to 1`
    )
  }
}

/**
 * The get step: runs the func against the project and reports what it found.
 * A func that returns nothing is `quiet`; one that throws, or returns a score
 * outside 0..1, throws, so the workflow retries it.
 */
export const checkAttention = async (
  attention: PikkuAttentionFunc,
  services: any,
  data: AttentionFuncInput,
  wire: PikkuWire
): Promise<AttentionOutcome> => {
  const found = await attention.func(services, data, wire)
  if (found === undefined || found === null) return { status: 'quiet' }
  assertScore(attention.widget, found)
  return { status: 'attention', score: found }
}

/** The store step: keeps the outcome as the latest run, stamped with the time it finished. */
export const storeAttention = async (
  services: any,
  widget: string,
  data: AttentionFuncInput & { outcome: AttentionOutcome }
): Promise<AttentionResult> => {
  const { outcome } = data
  const result: AttentionResult = {
    projectKey: data.projectKey,
    widget,
    status: outcome.status,
    ...(outcome.status === 'attention' ? { score: outcome.score } : {}),
    ...(outcome.status === 'failed' ? { error: outcome.error } : {}),
    updatedAt: new Date(),
  }
  await attentionResultStore(services).put(result)
  return result
}

const registered = (widget: string) => {
  const attention = pikkuState(null, 'attention', 'funcs').get(widget)
  if (!attention) {
    throw new Error(
      `No attention func is registered for widget '${widget}'. Declared: ${[...pikkuState(null, 'attention', 'funcs').keys()].join(', ') || 'none'}`
    )
  }
  return attention
}

/**
 * The latest stored run of a widget for a project, or `undefined` when it has
 * never run. Reads the store only: nothing is checked at view time.
 */
export const getAttention = async (
  services: any,
  input: { projectKey: string; widget: string }
): Promise<AttentionResult | undefined> => {
  registered(input.widget)
  return attentionResultStore(services).get(input.projectKey, input.widget)
}

/**
 * Runs the widget's workflow for a project now, and returns what it stored.
 * The project is remembered, so the schedule keeps it fresh from here on.
 */
export const refreshAttention = async (
  services: any,
  wire: PikkuWire,
  input: { projectKey: string; widget: string }
): Promise<AttentionResult | undefined> => {
  registered(input.widget)
  const store = attentionResultStore(services)
  await store.watch(input.projectKey, input.widget)
  await services.workflowService.startWorkflow(
    attentionWorkflowName(input.widget),
    { projectKey: input.projectKey },
    { type: 'attention', pikkuUserId: wire.pikkuUserId },
    wire.rpc,
    { inline: true }
  )
  return store.get(input.projectKey, input.widget)
}

/**
 * The scheduled task body: starts the widget's workflow for every project that
 * has asked for it.
 */
export const refreshWatchedAttention = async (
  services: any,
  wire: PikkuWire,
  widget: string
): Promise<number> => {
  const projectKeys = await attentionResultStore(services).projectKeys(widget)
  for (const projectKey of projectKeys) {
    await services.workflowService.startWorkflow(
      attentionWorkflowName(widget),
      { projectKey },
      { type: 'attention' },
      wire.rpc
    )
  }
  return projectKeys.length
}
