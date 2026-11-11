/**
 * The retention and compaction job (plan 4.5). A TTL frees nothing on its own:
 * GreptimeDB drops expired rows when a table is flushed and compacted, so the job
 * sets the TTL and then flushes and compacts every telemetry table.
 */
import type { GreptimeTelemetryStore } from './greptime-store.js'

export const DEFAULT_RETENTION_DAYS = 14
/** When the database is over its cap the job keeps this many days instead. */
export const CAPPED_RETENTION_DAYS = 3
export const DEFAULT_MAX_MB = 2048
const SIX_HOURS_MS = 6 * 60 * 60 * 1000
const FIRST_RUN_MS = 60_000

export interface RetentionOptions {
  /** Days to keep. Default 14. */
  days?: number
  /** Disk cap in MiB. Default 2048. Over it, only 3 days are kept for this run. */
  maxMb?: number
  warn?: (message: string) => void
}

export interface RetentionResult {
  /** The days applied this run. */
  days: number
  /** The database was over its cap, so fewer days were kept. */
  capped: boolean
  /** Size on disk before the run, in bytes. */
  bytesBefore: number
}

/** One pass: size check, TTL, flush, compact. */
export const runRetention = async (
  store: GreptimeTelemetryStore,
  options: RetentionOptions = {}
): Promise<RetentionResult> => {
  const days = options.days ?? DEFAULT_RETENTION_DAYS
  const maxBytes = (options.maxMb ?? DEFAULT_MAX_MB) * 1024 * 1024
  const bytesBefore = await store.diskBytes()
  const capped = bytesBefore > maxBytes && days > CAPPED_RETENTION_DAYS
  const applied = capped ? CAPPED_RETENTION_DAYS : days
  if (capped) {
    options.warn?.(
      `GreptimeDB telemetry is ${Math.round(bytesBefore / 1024 / 1024)} MiB, over the ${options.maxMb ?? DEFAULT_MAX_MB} MiB cap: keeping ${applied} days this run instead of ${days}`
    )
  }
  await store.retain({ days: applied })
  return { days: applied, capped, bytesBefore }
}

export interface RetentionJobOptions extends RetentionOptions {
  /** Between runs. Default 6 hours. */
  intervalMs?: number
  /** Before the first run. Default 60 seconds. */
  firstRunMs?: number
  /** Called after every run, whatever its outcome. */
  onRun?: (outcome: RetentionResult | Error) => void
}

/**
 * Runs `runRetention` shortly after start and then on an interval, one at a
 * time, on unref'd timers. A failed run is reported and the next one still
 * happens. Returns a function that stops it.
 */
export const startRetentionJob = (
  store: GreptimeTelemetryStore,
  options: RetentionJobOptions = {}
): (() => void) => {
  let stopped = false
  let timer: ReturnType<typeof setTimeout> | undefined
  const schedule = (delay: number) => {
    timer = setTimeout(() => void pass(), delay)
    timer.unref()
  }
  const pass = async () => {
    if (stopped) return
    try {
      options.onRun?.(await runRetention(store, options))
    } catch (error) {
      options.warn?.(
        `GreptimeDB retention failed: ${error instanceof Error ? error.message : String(error)}`
      )
      options.onRun?.(error instanceof Error ? error : new Error(String(error)))
    }
    if (!stopped) schedule(options.intervalMs ?? SIX_HOURS_MS)
  }
  schedule(options.firstRunMs ?? FIRST_RUN_MS)
  return () => {
    stopped = true
    if (timer) clearTimeout(timer)
  }
}
