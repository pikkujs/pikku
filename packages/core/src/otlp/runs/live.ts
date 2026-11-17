import type { Logger } from '../../services/logger.js'
import type { ScopeDefinitionMeta } from '../../wirings/scope/scope.types.js'
import type { OtlpSinkBase, OtlpSinkRegistry } from '../otlp-sink.js'
import { createRunStitcher } from './run-stitcher.js'
import type {
  RunEvent,
  RunSnapshot,
  RunStitcher,
  SpanFrameEnd,
  SpanFrameStart,
} from './types.js'

/** What a caller must hold to read the live runs: the snapshot and the stream. */
export const OTLP_RUNS_SCOPE = 'pikku:otlp:runs'

/** The scope tree core declares for {@link OTLP_RUNS_SCOPE}. */
export const otlpRunsScopeDefinition = (): ScopeDefinitionMeta => ({
  name: 'pikku',
  displayName: 'Pikku',
  description: 'What the Pikku runtime itself offers',
  scopes: {
    otlp: {
      displayName: 'Telemetry',
      description: 'Watching what this backend is doing, live',
      scopes: {
        runs: {
          description:
            'Read the live runs of this backend: the snapshot and the stream',
        },
      },
    },
  },
  origin: { kind: 'generated' },
})

/** The topic every run event and health sample is published to. */
export const OTLP_RUNS_TOPIC = 'otlp.runs'

/** What one publish carries. `v` lets a client refuse a shape it does not know. */
export interface OtlpRunsBatch {
  v: 1
  events: RunEvent[]
}

/** The only thing the listener needs from the event hub: `eventHub.publish` fits. */
export type OtlpLivePublish = (
  topic: typeof OTLP_RUNS_TOPIC,
  payload: OtlpRunsBatch
) => void | Promise<void>

export interface OtlpLive {
  /** Drains what is queued, then returns the stitcher's snapshot: events with a greater `seq` follow it. */
  snapshot(): RunSnapshot
  /** Stops the timers, publishes what is left and makes the sink inert. Safe to call twice. */
  close(): void
  /** Counters for tests and the debug surface; nothing here is a contract. */
  stats(): { queued: number; dropped: number; publishFailures: number }
}

/** Everything a test replaces: the clock and the two timers. */
export interface OtlpLiveClock {
  now(): number
  every(fn: () => void, ms: number): () => void
}

const realClock: OtlpLiveClock = {
  now: () => Date.now(),
  every: (fn, ms) => {
    const timer = setInterval(fn, ms)
    ;(timer as { unref?: () => void }).unref?.()
    return () => clearInterval(timer)
  },
}

export interface RegisterOtlpLiveOptions {
  otlpSinks: OtlpSinkRegistry
  publish: OtlpLivePublish
  serviceName: string
  /** How often the queue is drained into the stitcher and the batch published. Default 75. */
  flushMs?: number
  /** Frames held between drains; past it the OLDEST is dropped. Default 5000. */
  maxQueue?: number
  /** How often the stitcher settles, expires and emits health. Default 1000. */
  sweepMs?: number
  /** Events per publish. A drain with more is published in several batches, in order. Default 500. */
  maxBatch?: number
  clock?: OtlpLiveClock
  /** Where the first publish failure, stitcher exception and queue drop are reported, then once a minute with counts. */
  logger?: Pick<Logger, 'warn'>
}

const REPORT_EVERY_MS = 60_000

type Frame =
  | { kind: 'start'; frame: SpanFrameStart; receivedMs: number }
  | { kind: 'end'; frame: SpanFrameEnd; receivedMs: number }

/** A ring: push and drop-oldest are O(1), which is what the request path may afford. */
class BoundedQueue<T> {
  private readonly items: (T | undefined)[]
  private head = 0
  private size = 0
  dropped = 0
  constructor(private readonly capacity: number) {
    this.items = new Array(capacity)
  }
  push(item: T): void {
    if (this.size === this.capacity) {
      this.items[this.head] = item
      this.head = (this.head + 1) % this.capacity
      this.dropped++
      return
    }
    this.items[(this.head + this.size) % this.capacity] = item
    this.size++
  }
  drain(): T[] {
    const out: T[] = new Array(this.size)
    for (let i = 0; i < this.size; i++) {
      const at = (this.head + i) % this.capacity
      out[i] = this.items[at] as T
      this.items[at] = undefined
    }
    this.head = 0
    this.size = 0
    return out
  }
  get length(): number {
    return this.size
  }
}

// Registering twice against one registry returns the first live handle, not a second sink.
const registered = new WeakMap<
  OtlpSinkRegistry,
  OtlpLive & { closed: boolean }
>()

/**
 * Feeds the run stitcher from the process's own OTLP frames and publishes what
 * it emits. The sink callbacks only push a frame into a bounded queue; the
 * stitcher runs on a timer, off the request path.
 */
export const registerOtlpLive = (
  options: RegisterOtlpLiveOptions
): OtlpLive => {
  const existing = registered.get(options.otlpSinks)
  if (existing && !existing.closed) return existing

  const {
    otlpSinks,
    publish,
    serviceName,
    flushMs = 75,
    maxQueue = 5000,
    sweepMs = 1000,
    maxBatch = 500,
    clock = realClock,
    logger,
  } = options

  const stitcher: RunStitcher = createRunStitcher({ resource: { serviceName } })
  const queue = new BoundedQueue<Frame>(maxQueue)
  let pending: RunEvent[] = []
  let publishFailures = 0
  let closed = false

  stitcher.subscribe((event) => pending.push(event))

  const reports = new Map<
    string,
    { count: number; lastAt?: number; detail?: string }
  >()
  const report = (what: string, count = 1, detail?: unknown): void => {
    const entry = reports.get(what) ?? { count: 0 }
    entry.count += count
    if (detail !== undefined) {
      entry.detail = detail instanceof Error ? detail.message : String(detail)
    }
    reports.set(what, entry)
    emit(what)
  }
  const emit = (what: string): void => {
    const entry = reports.get(what)
    if (!entry || entry.count === 0) return
    const at = clock.now()
    if (entry.lastAt !== undefined && at - entry.lastAt < REPORT_EVERY_MS)
      return
    try {
      logger?.warn(
        `Live runs: ${what}${entry.detail ? ` (${entry.detail})` : ''}, ${entry.count} since the last report`
      )
    } catch {
      // Reporting never takes the process down.
    }
    entry.count = 0
    entry.lastAt = at
  }
  let reportedDrops = 0

  const publishPending = (): void => {
    while (pending.length > 0) {
      const events = pending.slice(0, maxBatch)
      pending = pending.slice(events.length)
      try {
        const result = publish(OTLP_RUNS_TOPIC, { v: 1, events })
        if (result && typeof (result as Promise<void>).catch === 'function') {
          ;(result as Promise<void>).catch((error) => {
            publishFailures++
            report('publish failed', 1, error)
          })
        }
      } catch (error) {
        publishFailures++
        report('publish failed', 1, error)
      }
    }
  }

  const drain = (): void => {
    for (const item of queue.drain()) {
      try {
        // The time the frame was received, not drained, so a late drain does not skew the health window.
        if (item.kind === 'start') stitcher.start(item.frame, item.receivedMs)
        else stitcher.end(item.frame, item.receivedMs)
      } catch (error) {
        // One bad frame must not cost the others theirs.
        report('stitcher failed on a frame', 1, error)
      }
    }
    if (queue.dropped > reportedDrops) {
      report('queue full, oldest frames dropped', queue.dropped - reportedDrops)
      reportedDrops = queue.dropped
    }
    publishPending()
  }

  const sweep = (): void => {
    drain()
    try {
      stitcher.sweep(clock.now())
    } catch (error) {
      // Telemetry never takes the process down.
      report('stitcher failed to sweep', 1, error)
    }
    for (const what of reports.keys()) emit(what)
    publishPending()
  }

  const sink: OtlpSinkBase = {
    onSpanStart: (span) => {
      if (!closed)
        queue.push({ kind: 'start', frame: span, receivedMs: clock.now() })
    },
    exportSpans: (spans) => {
      if (closed) return
      const receivedMs = clock.now()
      for (const span of spans)
        queue.push({ kind: 'end', frame: span, receivedMs })
    },
    exportLogs() {},
    exportMetrics() {},
    flush: async () => {},
    close: async () => {},
  }
  otlpSinks.add(sink)

  const stopDrain = clock.every(drain, flushMs)
  const stopSweep = clock.every(sweep, sweepMs)

  const live: OtlpLive & { closed: boolean } = {
    get closed() {
      return closed
    },
    snapshot: () => {
      drain()
      return stitcher.snapshot(clock.now())
    },
    close: () => {
      if (closed) return
      sweep()
      closed = true
      stopDrain()
      stopSweep()
      registered.delete(otlpSinks)
    },
    stats: () => ({
      queued: queue.length,
      dropped: queue.dropped,
      publishFailures,
    }),
  }
  registered.set(otlpSinks, live)
  return live
}
