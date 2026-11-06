import { appendFileSync } from 'node:fs'

/**
 * What each process saw, one JSON line per event in a file they share, so the
 * test can rebuild a trace from every side of it. Exists for this suite only:
 * there is no Tracer yet, and without `DIST_RECORD_FILE` nothing is written.
 */
export type DistRecord = {
  kind: 'hop' | 'edge' | 'log'
  role: string
  at?: string
  run?: string
  traceId?: string
  spanId?: string
  parentSpanId?: string
  level?: string
}

export const role = process.env.DIST_ROLE ?? 'none'

export const record = (entry: Omit<DistRecord, 'role'>) => {
  const file = process.env.DIST_RECORD_FILE
  if (file) {
    appendFileSync(file, `${JSON.stringify({ ...entry, role })}\n`)
  }
}

type Traced = {
  traceId?: string
  trace?: { traceId: string; spanId: string; parentSpanId?: string }
}

export const hop = (at: string, run: string | undefined, wire: Traced) =>
  record({
    kind: 'hop',
    at,
    run,
    traceId: wire.traceId,
    spanId: wire.trace?.spanId,
    parentSpanId: wire.trace?.parentSpanId,
  })
