import type { Logger } from '../services/logger.js'
import { nowUnixNano, type FinishedSpan } from '../tracer.js'
import { AttributeTypes } from './attribute-types.js'
import { encodeLogs, encodeMetrics, encodeTraces } from './otlp-encode.js'
import type {
  EncodableSpan,
  OtlpLogRecord,
  OtlpMetricPoint,
  OtlpResource,
} from './otlp-types.js'

export interface OtlpExporterOptions {
  /** Base URL, e.g. `http://127.0.0.1:4000/v1/otlp`; `/v1/traces|logs|metrics` are appended. */
  endpoint: string
  /** Sent on every request (GreptimeDB: `x-greptime-db-name`, `x-greptime-pipeline-name`). */
  headers?: Record<string, string>
  /**
   * Headers for one signal, on top of `headers`. GreptimeDB needs
   * `x-greptime-pipeline-name: greptime_trace_v1` on traces only: on logs it is
   * rejected with a 400 ("Unsupported pipeline for logs").
   */
  headersBySignal?: Partial<
    Record<'traces' | 'logs' | 'metrics', Record<string, string>>
  >
  resource: OtlpResource
  /** Flush when either trips. Defaults 500 ms / 256 items. */
  flushIntervalMs?: number
  maxBatch?: number
  /** The `fetch` to use; tests inject one. */
  fetch?: typeof fetch
  /** Where exporter failures go, at most one line per minute per signal. */
  logger?: Pick<Logger, 'warn'> & Partial<Pick<Logger, 'debug'>>
  /** Pause before the single retry of a failed request. Default 1000 ms. */
  retryDelayMs?: number
  /** Failed batches in a row before the signal backs off. Default 10. */
  backoffAfterFailures?: number
  /** How long a backed-off signal sends nothing (it keeps queueing). Default 30 s. */
  backoffMs?: number
  /** Abort a request after this long. Default 10 s. */
  requestTimeoutMs?: number
  /** Clock for back-off and warning rate limits; tests inject one. */
  now?: () => number
}

/** What each queue holds before it drops the oldest. */
export const OTLP_QUEUE_LIMITS = {
  spans: 2048,
  logs: 4096,
  metrics: 512,
} as const

type Signal = keyof typeof OTLP_QUEUE_LIMITS

type QueueItem = EncodableSpan | OtlpLogRecord | OtlpMetricPoint

const PATH = {
  spans: 'traces',
  logs: 'logs',
  metrics: 'metrics',
} as const satisfies Record<Signal, 'traces' | 'logs' | 'metrics'>

const WARN_EVERY_MS = 60_000
const CLOSE_CAP_MS = 2000

interface SignalState<T> {
  queue: T[]
  dropped: number
  /** Dropped count already sent as a metric. */
  reported: number
  chain: Promise<void>
  failures: number
  backoffUntil: number
  lastWarnAt: number
}

const newState = <T>(): SignalState<T> => ({
  queue: [],
  dropped: 0,
  reported: 0,
  chain: Promise.resolve(),
  failures: 0,
  backoffUntil: 0,
  lastWarnAt: -Infinity,
})

/** A sleep that never keeps the process alive, and can be cancelled. */
const sleep = (ms: number) => {
  let timer: ReturnType<typeof setTimeout> | undefined
  const done = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, ms)
    ;(timer as { unref?: () => void }).unref?.()
  })
  return { done, cancel: () => clearTimeout(timer) }
}

/**
 * Batches spans, logs and metrics and POSTs them as OTLP/HTTP protobuf.
 *
 * Nothing here can fail a request: the `export*` methods only enqueue, a failed
 * POST is retried once and then dropped, and a queue that fills drops its
 * oldest entries and counts them in `pikku.telemetry.dropped`.
 *
 * knowledge: decisions/internals/otlp-exporter-is-protobuf-only-and-never-throws.md
 */
export class OtlpHttpExporter {
  private readonly spans = newState<EncodableSpan>()
  private readonly logs = newState<OtlpLogRecord>()
  private readonly metrics = newState<OtlpMetricPoint>()
  private readonly types = new AttributeTypes()
  private readonly startedAt = nowUnixNano()
  private readonly doFetch: typeof fetch
  private readonly base: string
  private readonly flushIntervalMs: number
  private readonly maxBatch: number
  private readonly now: () => number
  private timer: ReturnType<typeof setTimeout> | undefined
  private closed = false

  constructor(private readonly options: OtlpExporterOptions) {
    this.doFetch = options.fetch ?? ((input, init) => fetch(input, init))
    this.base = options.endpoint.replace(/\/+$/, '')
    this.flushIntervalMs = options.flushIntervalMs ?? 500
    this.maxBatch = options.maxBatch ?? 256
    this.now = options.now ?? Date.now
  }

  /** What was lost: records dropped by a full queue, and attribute values that could not take their key's type. */
  get stats() {
    return {
      dropped: {
        spans: this.spans.dropped,
        logs: this.logs.dropped,
        metrics: this.metrics.dropped,
      },
      attributesDropped: this.types.dropped,
    }
  }

  exportSpans(spans: FinishedSpan[]): void {
    this.enqueue('spans', this.spans, () =>
      spans.map((span) => ({
        ...span,
        attributes: this.types.coerce(span.attributes),
      }))
    )
  }

  exportLogs(records: OtlpLogRecord[]): void {
    this.enqueue('logs', this.logs, () => records)
  }

  exportMetrics(points: OtlpMetricPoint[]): void {
    this.enqueue('metrics', this.metrics, () => points)
  }

  /** Sends everything queued. Never rejects. */
  async flush(): Promise<void> {
    await Promise.all([
      this.drain('spans'),
      this.drain('logs'),
      this.drain('metrics'),
    ])
  }

  /** Flushes, capped at two seconds, then refuses further records. Never rejects. */
  async close(): Promise<void> {
    if (this.closed) return
    if (this.timer) clearTimeout(this.timer)
    this.timer = undefined
    const cap = sleep(CLOSE_CAP_MS)
    try {
      await Promise.race([this.flush(), cap.done])
    } finally {
      cap.cancel()
      this.closed = true
    }
  }

  private enqueue<T>(signal: Signal, state: SignalState<T>, make: () => T[]) {
    if (this.closed) return
    try {
      const items = make()
      if (items.length === 0) return
      state.queue.push(...items)
      const overflow = state.queue.length - OTLP_QUEUE_LIMITS[signal]
      if (overflow > 0) {
        state.queue.splice(0, overflow)
        state.dropped += overflow
      }
      if (state.queue.length >= this.maxBatch) void this.drain(signal)
      else this.arm()
    } catch {
      // Telemetry never breaks a request.
    }
  }

  private arm() {
    if (this.timer) return
    this.timer = setTimeout(() => {
      this.timer = undefined
      void this.flush()
    }, this.flushIntervalMs)
    // A pending flush must not keep a process alive; close() flushes on exit.
    ;(this.timer as { unref?: () => void }).unref?.()
  }

  private state(signal: Signal): SignalState<QueueItem> {
    return this[signal] as SignalState<QueueItem>
  }

  private drain(signal: Signal): Promise<void> {
    const state = this.state(signal)
    state.chain = state.chain.then(() => this.sendQueued(signal))
    return state.chain
  }

  private async sendQueued(signal: Signal): Promise<void> {
    try {
      const state = this.state(signal)
      while (this.now() >= state.backoffUntil) {
        const extra = signal === 'metrics' ? this.droppedPoints() : []
        const batch: QueueItem[] = [
          ...extra,
          ...state.queue.splice(0, this.maxBatch),
        ]
        if (batch.length === 0) return
        const sent = await this.post(signal, batch)
        if (sent) {
          state.failures = 0
          if (signal === 'metrics') this.markReported()
        } else {
          // Lost for good: count it, except the loss counters themselves.
          state.dropped += batch.length - extra.length
          if (++state.failures >= (this.options.backoffAfterFailures ?? 10)) {
            state.backoffUntil = this.now() + (this.options.backoffMs ?? 30_000)
          }
        }
      }
    } catch {
      // Telemetry never breaks a request.
    }
  }

  /** The loss counters, as cumulative sums, when they moved since last sent. */
  private droppedPoints(): OtlpMetricPoint[] {
    const points: OtlpMetricPoint[] = []
    for (const signal of ['spans', 'logs', 'metrics'] as const) {
      const state = this.state(signal)
      if (state.dropped === state.reported) continue
      points.push({
        name: 'pikku.telemetry.dropped',
        unit: '1',
        kind: 'sum',
        integer: true,
        value: state.dropped,
        attributes: { signal },
      })
    }
    return points
  }

  private markReported() {
    for (const signal of ['spans', 'logs', 'metrics'] as const) {
      const state = this.state(signal)
      state.reported = state.dropped
    }
  }

  private encode(signal: Signal, batch: QueueItem[]): Uint8Array {
    const { resource } = this.options
    if (signal === 'spans')
      return encodeTraces(resource, batch as EncodableSpan[])
    if (signal === 'logs') return encodeLogs(resource, batch as OtlpLogRecord[])
    return encodeMetrics(resource, batch as OtlpMetricPoint[], this.startedAt)
  }

  /** One attempt plus one retry. Returns whether the batch was accepted. */
  private async post(signal: Signal, batch: QueueItem[]): Promise<boolean> {
    let body: Uint8Array
    try {
      body = this.encode(signal, batch)
    } catch {
      this.warn(signal, `could not encode ${batch.length} ${signal}; dropped`)
      return false
    }
    for (let attempt = 0; attempt < 2; attempt++) {
      const { outcome, status } = await this.attempt(signal, body)
      if (outcome === 'ok') return true
      if (outcome === 'rejected') {
        this.rejected(signal, batch, status)
        return false
      }
      if (attempt === 0) {
        const wait = sleep(this.options.retryDelayMs ?? 1000)
        await wait.done
        wait.cancel()
      }
    }
    this.warn(signal, `export of ${batch.length} ${signal} failed; dropped`)
    return false
  }

  private async attempt(
    signal: Signal,
    body: Uint8Array
  ): Promise<{ outcome: 'ok' | 'rejected' | 'retry'; status?: number }> {
    try {
      const response = await this.doFetch(`${this.base}/v1/${PATH[signal]}`, {
        method: 'POST',
        headers: {
          ...this.options.headers,
          ...this.options.headersBySignal?.[PATH[signal]],
          'content-type': 'application/x-protobuf',
        },
        body: body as BodyInit,
        // A redirect would carry the batch somewhere the loopback guard never saw.
        redirect: 'error',
        signal: AbortSignal.timeout(this.options.requestTimeoutMs ?? 10_000),
      })
      const status = response.status
      void response.body?.cancel().catch(() => {})
      if (status >= 200 && status < 300) return { outcome: 'ok', status }
      // A 4xx is a data problem (a type conflict, a missing database): retrying
      // the same bytes cannot help. 408 and 429 are the exceptions.
      if (status >= 400 && status < 500 && status !== 408 && status !== 429) {
        return { outcome: 'rejected', status }
      }
      return { outcome: 'retry', status }
    } catch {
      return { outcome: 'retry' }
    }
  }

  private rejected(signal: Signal, batch: QueueItem[], status?: number) {
    this.warn(
      signal,
      `export of ${batch.length} ${signal} rejected with HTTP ${status}; dropped`
    )
    // Names only, never attributes: a rejected attribute may hold user data.
    if (signal === 'spans') {
      const names = (batch as EncodableSpan[]).slice(0, 8).map((s) => s.name)
      try {
        this.options.logger?.debug?.(`otlp rejected spans: ${names.join(', ')}`)
      } catch {}
    }
  }

  private warn(signal: Signal, message: string) {
    const state = this.state(signal)
    const at = this.now()
    if (at - state.lastWarnAt < WARN_EVERY_MS) return
    state.lastWarnAt = at
    try {
      this.options.logger?.warn(`otlp: ${message}`)
    } catch {}
  }
}
