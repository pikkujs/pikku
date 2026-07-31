import type { SerializedError } from '../../types/core.types.js'
import type { StepState, StepStatus } from './workflow.types.js'

export interface RunTimelineEvent {
  seq: number
  at: Date
  type: Extract<
    StepStatus,
    'pending' | 'scheduled' | 'running' | 'succeeded' | 'failed'
  >
  stepName: string
  attemptCount: number
  fromStepName?: string
  result?: unknown
  error?: SerializedError
}

export type RunTimeline = RunTimelineEvent[]

type HistoryEntry = StepState & { stepName: string }

const LIFECYCLE_ORDER: Record<RunTimelineEvent['type'], number> = {
  pending: 0,
  scheduled: 1,
  running: 2,
  succeeded: 3,
  failed: 3,
}

export function buildRunTimeline(history: HistoryEntry[]): RunTimeline {
  const raw: Array<Omit<RunTimelineEvent, 'seq'> & { order: number }> = []

  history.forEach((entry, order) => {
    const base = {
      stepName: entry.stepName,
      attemptCount: entry.attemptCount,
      order,
    }
    raw.push({
      ...base,
      at: entry.createdAt,
      type: 'pending',
      fromStepName: entry.fromStepName,
    })
    if (entry.scheduledAt) {
      raw.push({ ...base, at: entry.scheduledAt, type: 'scheduled' })
    }
    if (entry.runningAt) {
      raw.push({ ...base, at: entry.runningAt, type: 'running' })
    }
    if (entry.status === 'succeeded') {
      raw.push({
        ...base,
        at: entry.succeededAt ?? entry.updatedAt,
        type: 'succeeded',
        result: entry.result,
      })
    } else if (entry.status === 'failed') {
      raw.push({
        ...base,
        at: entry.failedAt ?? entry.updatedAt,
        type: 'failed',
        error: entry.error,
      })
    }
  })

  raw.sort((a, b) => {
    const ta = a.at.getTime()
    const tb = b.at.getTime()
    if (ta !== tb) return ta - tb
    const la = LIFECYCLE_ORDER[a.type]
    const lb = LIFECYCLE_ORDER[b.type]
    if (la !== lb) return la - lb
    return a.order - b.order
  })

  return raw.map(({ order: _order, ...event }, seq) => ({ ...event, seq }))
}

export interface ReconstructedStep {
  stepName: string
  status: StepStatus
  attemptCount: number
  fromStepName?: string
  result?: unknown
  error?: SerializedError
}

export type RunPhase = 'pending' | 'running' | 'failed' | 'idle'

export interface ReconstructedRunState {
  /** seq of the last applied event, or -1 if the point precedes all events. */
  seq: number
  at?: Date
  steps: ReconstructedStep[]
  results: Record<string, unknown>
  path: string[]
  phase: RunPhase
}

const IN_FLIGHT: ReadonlySet<StepStatus> = new Set([
  'pending',
  'scheduled',
  'running',
])

export function reconstructStateAt(
  timeline: RunTimeline,
  at: number | Date
): ReconstructedRunState {
  const cutoff = (event: RunTimelineEvent): boolean =>
    typeof at === 'number'
      ? event.seq <= at
      : event.at.getTime() <= at.getTime()

  const steps = new Map<string, ReconstructedStep>()
  const path: string[] = []
  let lastSeq = -1
  let lastAt: Date | undefined

  for (const event of timeline) {
    if (!cutoff(event)) break
    lastSeq = event.seq
    lastAt = event.at

    let step = steps.get(event.stepName)
    if (!step) {
      step = {
        stepName: event.stepName,
        status: event.type,
        attemptCount: event.attemptCount,
        fromStepName: event.fromStepName,
      }
      steps.set(event.stepName, step)
      path.push(event.stepName)
    }
    step.status = event.type
    step.attemptCount = event.attemptCount
    if (event.fromStepName !== undefined) {
      step.fromStepName = event.fromStepName
    }
    if (event.type === 'pending') {
      delete step.result
      delete step.error
    }
    if (event.type === 'succeeded') {
      step.result = event.result
      step.error = undefined
    }
    if (event.type === 'failed') {
      step.error = event.error
    }
  }

  const orderedSteps = path.map((name) => steps.get(name)!)
  const results: Record<string, unknown> = {}
  for (const step of orderedSteps) {
    if (step.status === 'succeeded') {
      results[step.stepName] = step.result
    }
  }

  return {
    seq: lastSeq,
    at: lastAt,
    steps: orderedSteps,
    results,
    path,
    phase: derivePhase(orderedSteps),
  }
}

export function reconstructFinalState(
  timeline: RunTimeline
): ReconstructedRunState {
  return reconstructStateAt(timeline, timeline.length - 1)
}

function derivePhase(steps: ReconstructedStep[]): RunPhase {
  if (steps.length === 0) return 'pending'
  if (steps.some((s) => IN_FLIGHT.has(s.status))) return 'running'
  if (steps.some((s) => s.status === 'failed')) return 'failed'
  return 'idle'
}
