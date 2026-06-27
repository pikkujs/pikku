import type { SerializedError } from '../../types/core.types.js'
import type { StepState, StepStatus } from './workflow.types.js'

/**
 * Time-travel over a workflow run.
 *
 * A run's durable history (`getRunHistory`) is one row per step *attempt*, each
 * carrying lifecycle timestamps (created/scheduled/running/succeeded/failed).
 * `buildRunTimeline` explodes those rows into a flat, chronologically-ordered
 * event stream, and `reconstructStateAt` folds the stream up to any point to
 * recover what the run "knew" then — the same step cache a replay would hold:
 * per-step status, accumulated results, and the walked path.
 *
 * These are pure functions over history — no IO — so they're trivially testable
 * and transport-independent (the same fold works for Redis/Kysely/in-memory).
 */

/** A single observable transition of one step attempt. */
export interface RunTimelineEvent {
  /** Monotonic 0-based position in the timeline. */
  seq: number
  /** When it happened. */
  at: Date
  /** The step's new status at this event (matches StepStatus lifecycle). */
  type: Extract<
    StepStatus,
    'pending' | 'scheduled' | 'running' | 'succeeded' | 'failed'
  >
  /** Physical step name (includes revisit ordinal, e.g. `attempt#2`). */
  stepName: string
  /** Which attempt this event belongs to (1-based). */
  attemptCount: number
  /** Predecessor that scheduled this step — only on the `pending` (created)
   *  event; undefined for entry steps. Reconstructs the walked edge. */
  fromStepName?: string
  /** Result snapshot — only on `succeeded`. */
  result?: unknown
  /** Error snapshot — only on `failed`. */
  error?: SerializedError
}

export type RunTimeline = RunTimelineEvent[]

type HistoryEntry = StepState & { stepName: string }

/** Lifecycle tiebreak for events that share a timestamp. */
const LIFECYCLE_ORDER: Record<RunTimelineEvent['type'], number> = {
  pending: 0,
  scheduled: 1,
  running: 2,
  succeeded: 3,
  failed: 3,
}

/**
 * Build the ordered event stream for a run from its raw history.
 *
 * History is expected oldest-first but is sorted defensively by (timestamp,
 * lifecycle, original index) so simultaneous timestamps stay deterministic.
 */
export function buildRunTimeline(history: HistoryEntry[]): RunTimeline {
  const raw: Array<Omit<RunTimelineEvent, 'seq'> & { order: number }> = []

  history.forEach((entry, order) => {
    const base = {
      stepName: entry.stepName,
      attemptCount: entry.attemptCount,
      order,
    }
    // The created event always exists; it carries provenance.
    raw.push({
      ...base,
      at: entry.createdAt,
      type: 'pending',
      fromStepName: entry.fromStepName,
    })
    // Intermediate events are optional enrichment — emit only if the backend
    // recorded their timestamp.
    if (entry.scheduledAt) {
      raw.push({ ...base, at: entry.scheduledAt, type: 'scheduled' })
    }
    if (entry.runningAt) {
      raw.push({ ...base, at: entry.runningAt, type: 'running' })
    }
    // The terminal event is driven by the row's authoritative status (the
    // lifecycle timestamps aren't populated by every backend — Kysely leaves
    // them null), falling back to updatedAt when the specific stamp is absent.
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

/** A step's reconstructed state at a point in the timeline. */
export interface ReconstructedStep {
  stepName: string
  status: StepStatus
  attemptCount: number
  fromStepName?: string
  result?: unknown
  error?: SerializedError
}

/** Coarse run phase derived purely from step states (not the run's output). */
export type RunPhase = 'pending' | 'running' | 'failed' | 'idle'

/** The whole run's reconstructed state at a point in the timeline. */
export interface ReconstructedRunState {
  /** seq of the last applied event, or -1 if the point precedes all events. */
  seq: number
  /** Wall-clock time of the last applied event. */
  at?: Date
  /** Per-step latest state, in first-seen (walked) order. */
  steps: ReconstructedStep[]
  /** Outputs available to downstream steps — the replay step cache at this
   *  point (succeeded steps only). */
  results: Record<string, unknown>
  /** Step names in the order they were first created — the walked path. */
  path: string[]
  /** Derived phase: `running` if any step is in-flight, else `failed` if a step
   *  is failed with no in-flight work, else `idle` (between transitions). */
  phase: RunPhase
}

const IN_FLIGHT: ReadonlySet<StepStatus> = new Set([
  'pending',
  'scheduled',
  'running',
])

/**
 * Fold the timeline up to `at` and return the run's state at that point.
 *
 * `at` is either a seq index (inclusive — apply events `0..at`) or a `Date`
 * (inclusive — apply every event at or before that instant). A point before the
 * first event yields the empty initial state.
 */
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
    // A retry's created event reopens the step — drop the prior outcome.
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

/** Reconstruct the final state (fold the whole timeline). */
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
