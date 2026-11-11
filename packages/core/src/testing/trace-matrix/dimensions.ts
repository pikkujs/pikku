import { crossProduct, pairwiseCombos, type Combo } from './pairwise.js'

export const STARTS = [
  'http',
  'channel',
  'mcp',
  'cli',
  'trigger',
  'gateway',
  'queue-job',
  'schedule',
  'agent-tool',
] as const
export const HOPS = [
  'rpc',
  'mesh',
  'remote-addon',
  'enqueue',
  'schedule',
  'start-workflow',
  'child-workflow',
] as const
export const ADAPTERS = ['in-memory', 'bullmq', 'pg-boss', 'nats'] as const
export const WORKFLOWS = [
  'dsl-queued',
  'dsl-inline',
  'graph-queued',
  'graph-inline',
] as const
export const STEPS = [
  'rpc',
  'sleep',
  'suspend',
  'approval',
  'fan-out',
  'retry',
  'compensation',
] as const
export const INBOUNDS = ['none', 'valid', 'invalid', 'forged'] as const
export const OUTCOMES = [
  'success',
  'throw-pikku-error',
  'throw-plain-error',
  'schema-invalid',
  'auth-mesh-jwt',
  'auth-remote-addon',
  'permission-denied',
  'remote-4xx',
  'remote-5xx',
  'remote-network',
  'remote-timeout',
  'job-exhausted',
  'job-discarded',
  'job-poison',
  'abandoned',
  'step-compensated',
  'workflow-cancelled',
  'approval-rejected',
  'fan-out-sibling-failure',
] as const
export const TIMINGS = [
  'immediate',
  'delayed-job',
  'sleep-wakeup',
  'slow-overlap',
  'retry-backoff',
  'lease-expiry-redelivery',
  'duplicate-delivery',
  'concurrent-starts',
  'enqueue-before-fail',
  'job-after-parent',
] as const

export type Start = (typeof STARTS)[number]
export type Hop = (typeof HOPS)[number]
export type Adapter = (typeof ADAPTERS)[number]
export type Workflow = (typeof WORKFLOWS)[number]
export type Step = (typeof STEPS)[number]
export type Inbound = (typeof INBOUNDS)[number]
export type Outcome = (typeof OUTCOMES)[number]
export type Timing = (typeof TIMINGS)[number]

const WORKFLOW_OUTCOMES: readonly string[] = [
  'step-compensated',
  'workflow-cancelled',
  'approval-rejected',
  'fan-out-sibling-failure',
]
const REMOTE_OUTCOMES: readonly string[] = [
  'auth-remote-addon',
  'remote-4xx',
  'remote-5xx',
  'remote-network',
  'remote-timeout',
]
const JOB_OUTCOMES: readonly string[] = [
  'job-exhausted',
  'job-discarded',
  'job-poison',
]
/** Timings that are about how a queue delivers a job. */
const DELIVERY_TIMINGS: readonly string[] = [
  'delayed-job',
  'lease-expiry-redelivery',
  'duplicate-delivery',
  'job-after-parent',
]

const isWorkflowHop = (hop?: string) =>
  hop === 'start-workflow' || hop === 'child-workflow'
const isInline = (workflow?: string) => workflow?.endsWith('-inline') ?? false
const isGraph = (workflow?: string) => workflow?.startsWith('graph') ?? false

const noStep = (step?: string) => step === undefined || step === 'none'

const known = (...values: Array<string | undefined>) =>
  values.every((value) => value !== undefined)

/**
 * Whether a partial combination could only be run by a queue, given the chain
 * has no queue job in it. Undecided until both the start and the hop are known.
 */
const noJobInChain = ({ start, hop }: Combo) =>
  known(start, hop) && start !== 'queue-job' && hop !== 'enqueue'

/**
 * The combinations that cannot happen, each with why. Every matrix goes through
 * this list and reports what it dropped, so nothing is filtered silently. Rules
 * see partial combinations and must stay undecided (false) on a missing value.
 */
export const EXCLUSIONS: ReadonlyArray<{
  id: string
  why: string
  applies: (combo: Combo) => boolean
}> = [
  {
    id: 'no-inbound-carrier',
    why: 'CLI argv, a trigger source event and a gateway platform message carry no traceparent: each is the root of a trace',
    applies: ({ start, inbound }) =>
      known(start, inbound) &&
      ['cli', 'trigger', 'gateway'].includes(start!) &&
      inbound !== 'none',
  },
  {
    id: 'agent-caller-trace-is-not-parsed',
    why: 'An agent tool takes the TraceContext object of its own caller, in-process: no string to be malformed or forged',
    applies: ({ start, inbound }) =>
      start === 'agent-tool' && (inbound === 'invalid' || inbound === 'forged'),
  },
  {
    id: 'job-outcome-needs-a-job',
    why: 'Exhausted retries, discard and poison are about a queue job, and the chain has none',
    applies: (combo) =>
      JOB_OUTCOMES.includes(combo.outcome!) && noJobInChain(combo),
  },
  {
    id: 'remote-outcome-needs-a-remote-addon',
    why: 'Remote addon failures only exist on a hop to a remote addon',
    applies: ({ hop, outcome, step }) =>
      // A workflow step's RPC can itself be a remote addon call.
      noStep(step) &&
      known(hop) &&
      REMOTE_OUTCOMES.includes(outcome!) &&
      hop !== 'remote-addon',
  },
  {
    id: 'mesh-auth-needs-mesh',
    why: 'pikkuMeshAuthMiddleware guards a mesh hop or an HTTP route; nothing else presents a mesh JWT',
    applies: ({ start, hop, outcome, step }) =>
      noStep(step) &&
      known(start, hop) &&
      outcome === 'auth-mesh-jwt' &&
      hop !== 'mesh' &&
      start !== 'http',
  },
  {
    id: 'remote-host-validates-for-itself',
    why: 'Schema and permission checks of a remote addon run on its host; this side sees a remote-4xx, its own outcome',
    applies: ({ hop, outcome }) =>
      hop === 'remote-addon' &&
      (outcome === 'schema-invalid' || outcome === 'permission-denied'),
  },
  {
    id: 'workflow-outcome-needs-a-workflow',
    why: 'Compensation, cancellation, approval and fan-out only exist inside a workflow run',
    applies: ({ hop, outcome }) =>
      known(hop) && WORKFLOW_OUTCOMES.includes(outcome!) && !isWorkflowHop(hop),
  },
  {
    id: 'workflow-dimensions-need-a-workflow-hop',
    why: 'Pairwise only: a chain with no workflow in it has no workflow type or step, which is the value `none`',
    applies: ({ hop, workflow, step }) =>
      known(hop) &&
      ((workflow !== undefined &&
        (workflow !== 'none') !== isWorkflowHop(hop)) ||
        (step !== undefined && (step !== 'none') !== isWorkflowHop(hop))),
  },
  {
    id: 'adapter-needs-a-queue',
    why: 'Pairwise only: a chain with no job through a queue exercises no adapter, so only the in-memory value applies',
    applies: ({ adapter, start, hop, workflow }) =>
      known(adapter, start, hop, workflow) &&
      adapter !== 'in-memory' &&
      start !== 'queue-job' &&
      hop !== 'enqueue' &&
      !workflow!.endsWith('-queued'),
  },
  {
    id: 'graph-has-no-such-step',
    why: 'A graph is RPC nodes: sleep, suspend and approval are DSL primitives',
    applies: ({ workflow, step }) =>
      isGraph(workflow) && ['sleep', 'suspend', 'approval'].includes(step!),
  },
  {
    id: 'inline-graph-has-no-retry-loop',
    why: 'An inline graph node does not retry',
    applies: ({ workflow, step, timing }) =>
      workflow === 'graph-inline' &&
      (step === 'retry' || timing === 'retry-backoff'),
  },
  {
    id: 'inline-run-has-no-job',
    why: 'An inline workflow does not touch the queue, so no job can exhaust, be discarded or be poison',
    applies: ({ workflow, outcome }) =>
      isInline(workflow) && JOB_OUTCOMES.includes(outcome!),
  },
  {
    id: 'approval-outcome-needs-approval-step',
    why: 'Only an approval step can be rejected',
    applies: ({ step, outcome }) =>
      known(step) &&
      step !== 'none' &&
      outcome === 'approval-rejected' &&
      step !== 'approval',
  },
  {
    id: 'fan-out-outcome-needs-fan-out-step',
    why: 'Only a fan-out has concurrent siblings',
    applies: ({ step, outcome }) =>
      known(step) &&
      step !== 'none' &&
      outcome === 'fan-out-sibling-failure' &&
      step !== 'fan-out',
  },
  {
    id: 'delivery-timing-needs-a-job',
    why: 'Delays, redelivery and duplicates are how a queue delivers a job, and the chain has none',
    applies: (combo) =>
      DELIVERY_TIMINGS.includes(combo.timing!) && noJobInChain(combo),
  },
  {
    id: 'enqueue-timing-needs-enqueue',
    why: 'Only a chain that enqueues can enqueue just before failing, or leave a job to outlive it',
    applies: ({ hop, timing }) =>
      known(hop) &&
      (timing === 'enqueue-before-fail' || timing === 'job-after-parent') &&
      hop !== 'enqueue',
  },
  {
    id: 'sleep-timing-needs-sleep-step',
    why: 'Only a sleep step wakes up',
    applies: ({ hop, step, timing }) =>
      timing === 'sleep-wakeup' &&
      ((known(hop) && !isWorkflowHop(hop)) ||
        (known(step) && step !== 'sleep')),
  },
  {
    id: 'retry-timing-needs-a-retry',
    why: 'Backoff needs a retried job or a retried step, and only an outcome that fails once can show it',
    applies: ({ start, hop, step, outcome, timing }) =>
      timing === 'retry-backoff' &&
      ((known(start, hop) &&
        start !== 'queue-job' &&
        hop !== 'enqueue' &&
        !isWorkflowHop(hop)) ||
        (known(outcome) &&
          outcome !== 'success' &&
          outcome !== 'job-exhausted') ||
        (known(hop, step) && isWorkflowHop(hop) && step !== 'retry')),
  },
]

/** The first rule that excludes this combination, if any. */
export const exclusionOf = (combo: Combo) =>
  EXCLUSIONS.find((rule) => rule.applies(combo))?.id

export type MatrixReport = {
  name: string
  generated: number
  included: number
  excluded: Record<string, number>
}

const tally = (name: string, combos: Combo[]) => {
  const included: Combo[] = []
  const excluded: Record<string, number> = {}
  for (const combo of combos) {
    const rule = exclusionOf(combo)
    if (rule) excluded[rule] = (excluded[rule] ?? 0) + 1
    else included.push(combo)
  }
  const report: MatrixReport = {
    name,
    generated: combos.length,
    included: included.length,
    excluded,
  }
  return { combos: included, report }
}

/** Start × hop × outcome. */
export const chainMatrix = () =>
  tally(
    'start × hop × outcome',
    crossProduct({ start: STARTS, hop: HOPS, outcome: OUTCOMES })
  )

/** Adapter × workflow × step × outcome. */
export const workflowMatrix = () =>
  tally(
    'adapter × workflow × step × outcome',
    crossProduct({
      adapter: ADAPTERS,
      workflow: WORKFLOWS,
      step: STEPS,
      outcome: OUTCOMES,
    })
  )

/**
 * Every value pair across all eight dimensions. `workflow` and `step` gain the
 * value `none` for a chain with no workflow in it.
 */
export const pairwiseMatrix = () => {
  const rulesUsed = new Set<string>()
  const { combos, impossible, pairs } = pairwiseCombos(
    {
      start: STARTS,
      hop: HOPS,
      inbound: INBOUNDS,
      outcome: OUTCOMES,
      timing: TIMINGS,
      workflow: ['none', ...WORKFLOWS],
      step: ['none', ...STEPS],
      adapter: ADAPTERS,
    },
    (partial) => {
      const rule = exclusionOf(partial)
      if (rule) rulesUsed.add(rule)
      return rule === undefined
    }
  )
  const excluded: Record<string, number> = {}
  for (const key of impossible) {
    const pair = Object.fromEntries(
      key.split('&').map((part) => part.split('=') as [string, string])
    )
    const rule = exclusionOf(pair) ?? 'no-combination-holds-this-pair'
    excluded[rule] = (excluded[rule] ?? 0) + 1
  }
  const report: MatrixReport = {
    name: 'pairwise (value pairs)',
    generated: pairs,
    included: pairs - impossible.length,
    excluded,
  }
  return { combos, report, impossible, rulesUsed }
}
