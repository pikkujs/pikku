import type { Lease, LeaseService } from '@pikku/core/services'
import type { PikkuWorkflowService } from '@pikku/core/workflow'

const RUN_LEASE_PREFIX = 'workflow-run:'

/** `[run id, start, end]`, in milliseconds of the machine-wide monotonic clock. */
export type Interval = [string, number, number]

/**
 * `process.hrtime` reads one clock for every process on the machine, so
 * intervals recorded by separate worker processes can be laid side by side.
 */
const now = () => Number(process.hrtime.bigint()) / 1e6

class IntervalRecorder {
  readonly intervals: Interval[] = []
  private inside = new Map<string, number>()
  maxInside = 0

  /** Opens an interval for `runId`; the returned function closes it. */
  open(runId: string): () => void {
    const count = (this.inside.get(runId) ?? 0) + 1
    this.inside.set(runId, count)
    this.maxInside = Math.max(this.maxInside, count)
    const start = now()
    return () => {
      this.intervals.push([runId, start, now()])
      this.inside.set(runId, this.inside.get(runId)! - 1)
    }
  }

  async around<T>(runId: string, fn: () => Promise<T>): Promise<T> {
    const close = this.open(runId)
    try {
      return await fn()
    } finally {
      close()
    }
  }
}

/**
 * Wraps the app's `LeaseService` and records every `workflow-run:*` holder:
 * from the acquire that granted its lease to the release that gave it back,
 * plus every acquire the lease refused and every refresh that found it lost.
 */
export class RunLeaseProbe implements LeaseService {
  readonly holders = new IntervalRecorder()
  refused = 0
  lost = 0
  private held = new Map<string, () => void>()

  constructor(private inner: LeaseService) {}

  async acquire(key: string, holder: string, ttlMs: number) {
    const lease = await this.inner.acquire(key, holder, ttlMs)
    const runId = runIdOf(key)
    if (runId === undefined) return lease
    if (!lease) {
      this.refused++
      return lease
    }
    this.held.set(holdingOf(lease), this.holders.open(runId))
    return lease
  }

  async refresh(lease: Lease, ttlMs: number) {
    const next = await this.inner.refresh(lease, ttlMs)
    if (!next && runIdOf(lease.key) !== undefined) this.lost++
    return next
  }

  async release(lease: Lease) {
    try {
      await this.inner.release(lease)
    } finally {
      this.held.get(holdingOf(lease))?.()
      this.held.delete(holdingOf(lease))
    }
  }

  get(key: string) {
    return this.inner.get(key)
  }
}

const runIdOf = (key: string) =>
  key.startsWith(RUN_LEASE_PREFIX)
    ? key.slice(RUN_LEASE_PREFIX.length)
    : undefined

const holdingOf = (lease: Lease) =>
  `${lease.key}|${lease.holder}|${lease.token}`

type WorkflowServiceClass = abstract new (
  ...args: any[]
) => PikkuWorkflowService

/**
 * Records every orchestration pass as the engine runs it, whether or not a
 * lease was taken for it — the holder count alone cannot see a pass that
 * skipped the lease.
 */
export const recordingPasses = <T extends WorkflowServiceClass>(Base: T) => {
  abstract class Recording extends Base {
    readonly passes = new IntervalRecorder()

    override withRunLease<R>(id: string, fn: () => Promise<R>): Promise<R> {
      return super.withRunLease(id, () => this.passes.around(id, fn))
    }
  }
  return Recording
}

/** The most intervals for one run that were ever open at the same instant. */
export const maxOverlap = (intervals: Interval[]): number => {
  const byRun = new Map<string, Interval[]>()
  for (const interval of intervals) {
    const runIntervals = byRun.get(interval[0]) ?? []
    runIntervals.push(interval)
    byRun.set(interval[0], runIntervals)
  }
  let max = 0
  for (const runIntervals of byRun.values()) {
    const edges: Array<[number, number]> = []
    for (const [, start, end] of runIntervals) {
      edges.push([start, 1], [end, -1])
    }
    // An interval closing at the instant another opens did not overlap it.
    edges.sort((a, b) => a[0] - b[0] || a[1] - b[1])
    let open = 0
    for (const [, delta] of edges) {
      open += delta
      max = Math.max(max, open)
    }
  }
  return max
}
