import { LocalVariablesService } from '@pikku/core/services'
import { createScriptContent, putText } from '../script-content.js'

const variables = new LocalVariablesService()

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

export const role = String(variables.get('DIST_ROLE') ?? 'none')

/**
 * The content service has no atomic append across processes, so each event is
 * its own key under `DIST_RECORD_DIR`, named by a monotonic timestamp so the
 * suite can read them back in order.
 */
const pending = new Set<Promise<void>>()
let counter = 0

export const record = (entry: Omit<DistRecord, 'role'>): Promise<void> => {
  const dir = variables.get<string>('DIST_RECORD_DIR')
  if (!dir) return Promise.resolve()
  const key = `${process.hrtime.bigint().toString().padStart(24, '0')}-${process.pid}-${counter++}.json`
  const write = putText(
    createScriptContent(dir),
    'records',
    key,
    JSON.stringify({ ...entry, role })
  ).finally(() => pending.delete(write))
  pending.add(write)
  return write
}

export const flushRecords = () => Promise.all([...pending])

type Traced = {
  traceId?: string
  trace?: { traceId: string; spanId: string; parentSpanId?: string }
}

export const hop = (
  at: string,
  run: string | undefined,
  wire: Traced
): Promise<void> =>
  record({
    kind: 'hop',
    at,
    run,
    traceId: wire.traceId,
    spanId: wire.trace?.spanId,
    parentSpanId: wire.trace?.parentSpanId,
  })
