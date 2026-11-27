import type { SerializedError } from '../../errors/serialized-error.js'
import {
  isCompensationStepName,
  isMilestoneStepName,
  STEP_IN_FLIGHT_STATES,
} from './workflow-constants.js'
import type { StepStatus } from './workflow.types.js'

export interface UnwindRecord {
  stepName: string
  rpcName?: string | null
  status: StepStatus
  createdAt: Date
  updatedAt: Date
  succeededAt?: Date
  failedAt?: Date
  result?: unknown
  error?: SerializedError
  childRunId?: string
  data?: unknown
  retries?: number
  attemptCount?: number
}

export type UnwindStepState =
  'done' | 'rested' | 'stuck' | 'blocked' | 'running' | 'ready' | 'waiting'

export interface UnwindPlan {
  candidates: UnwindRecord[]
  states: Map<string, UnwindStepState>
  ready: UnwindRecord[]
  stuck: Array<{ stepName: string; error: string }>
  restedAt?: string
  childRestedAt?: string
  /** The forward steps in flight that the unwind waits for. */
  inFlight: UnwindRecord[]
  settled: boolean
  compensated: boolean
}

const startedAt = (record: UnwindRecord): number => record.createdAt.getTime()

const finishedAt = (record: UnwindRecord): number =>
  (record.succeededAt ?? record.failedAt ?? record.updatedAt).getTime()

export interface PlanUnwindInput {
  records: UnwindRecord[]
  skip: ReadonlySet<string>
  hasCompensation: (record: UnwindRecord) => boolean
  isChildWorkflow: (record: UnwindRecord) => boolean
  /**
   * Whether every forward step in flight is waited for, and not only those with
   * a compensation.
   */
  awaitsAll?: boolean
  /** Whether the unwind itself runs a `failed` compensation row again. */
  resumesFailed?: (compensation: UnwindRecord) => boolean
}

/** A store may list every attempt of a step; the unwind reads the latest. */
const latestAttempts = (records: UnwindRecord[]): UnwindRecord[] => {
  const latest = new Map<string, UnwindRecord>()
  for (const record of records) {
    const seen = latest.get(record.stepName)
    if (!seen || (record.attemptCount ?? 0) >= (seen.attemptCount ?? 0)) {
      latest.set(record.stepName, record)
    }
  }
  return records.filter((r) => latest.get(r.stepName) === r)
}

export function planUnwind(planInput: PlanUnwindInput): UnwindPlan {
  const input = { ...planInput, records: latestAttempts(planInput.records) }
  const forward = input.records.filter(
    (r) =>
      !isCompensationStepName(r.stepName) && !isMilestoneStepName(r.stepName)
  )
  const compRows = new Map(
    input.records
      .filter((r) => isCompensationStepName(r.stepName))
      .map((r) => [r.stepName, r])
  )
  const milestones = input.records
    .filter((r) => isMilestoneStepName(r.stepName) && r.status === 'succeeded')
    .sort(
      (a, b) =>
        finishedAt(b) - finishedAt(a) ||
        input.records.indexOf(b) - input.records.indexOf(a)
    )
  const lastMilestone = milestones[0]

  const inFlight = forward.filter(
    (r) =>
      STEP_IN_FLIGHT_STATES.has(r.status) &&
      (input.awaitsAll || input.hasCompensation(r))
  )

  let candidates = forward.filter((r) => {
    if (!r.rpcName || input.skip.has(r.stepName)) return false
    if (r.status === 'failed' && input.isChildWorkflow(r)) return false
    if (r.status !== 'succeeded' && r.status !== 'failed') return false
    return input.hasCompensation(r)
  })

  if (lastMilestone) {
    const at = finishedAt(lastMilestone)
    candidates = candidates.filter(
      (r) =>
        finishedAt(r) > at ||
        (finishedAt(r) === at &&
          input.records.indexOf(r) > input.records.indexOf(lastMilestone))
    )
  }
  candidates.sort(
    (a, b) =>
      finishedAt(b) - finishedAt(a) ||
      input.records.indexOf(b) - input.records.indexOf(a)
  )

  const order = (r: UnwindRecord): number => input.records.indexOf(r)
  const states = new Map<string, UnwindStepState>()
  const resolving = new Set<string>()

  const dependents = (x: UnwindRecord): UnwindRecord[] =>
    candidates.filter(
      (y) =>
        y !== x &&
        startedAt(y) >= finishedAt(x) &&
        (finishedAt(y) > finishedAt(x) ||
          (finishedAt(y) === finishedAt(x) && order(y) > order(x)))
    )

  const resolve = (x: UnwindRecord): UnwindStepState => {
    const cached = states.get(x.stepName)
    if (cached) return cached
    if (resolving.has(x.stepName)) return 'waiting'
    resolving.add(x.stepName)
    const comp = compRows.get(`${x.stepName}:compensate`)
    let state: UnwindStepState
    if (comp?.status === 'succeeded') {
      const restedAt = (comp.result as { restedAt?: string } | undefined)
        ?.restedAt
      state = restedAt ? 'rested' : 'done'
    } else if (comp?.status === 'failed' && !input.resumesFailed?.(comp)) {
      state = 'stuck'
    } else if (comp?.status === 'scheduled') {
      state = 'running'
    } else {
      const deps = dependents(x).map(resolve)
      if (
        deps.some((s) => s === 'stuck' || s === 'blocked' || s === 'rested')
      ) {
        state = 'blocked'
      } else if (deps.every((s) => s === 'done')) {
        state = 'ready'
      } else {
        state = 'waiting'
      }
    }
    resolving.delete(x.stepName)
    states.set(x.stepName, state)
    return state
  }
  for (const c of candidates) resolve(c)

  const ready = inFlight.length
    ? []
    : candidates.filter((c) => states.get(c.stepName) === 'ready')

  const stuck = candidates
    .filter((c) => states.get(c.stepName) === 'stuck')
    .map((c) => ({
      stepName: c.stepName,
      error:
        compRows.get(`${c.stepName}:compensate`)?.error?.message ??
        'compensation failed',
    }))

  const rested = candidates.find((c) => states.get(c.stepName) === 'rested')
  const childRestedAt = rested
    ? (
        compRows.get(`${rested.stepName}:compensate`)?.result as
          { restedAt?: string } | undefined
      )?.restedAt
    : undefined

  const open = candidates.some((c) => {
    const s = states.get(c.stepName)
    return s === 'ready' || s === 'waiting' || s === 'running'
  })

  const compensated = candidates.some((c) => {
    const s = states.get(c.stepName)
    return s === 'done' || s === 'rested'
  })

  return {
    candidates,
    states,
    ready,
    stuck,
    restedAt: lastMilestone
      ? milestoneNameOf(lastMilestone.stepName)
      : undefined,
    childRestedAt,
    inFlight,
    settled: !inFlight.length && !open,
    compensated,
  }
}

function milestoneNameOf(stepName: string): string {
  return stepName.slice(stepName.indexOf(':') + 1)
}
