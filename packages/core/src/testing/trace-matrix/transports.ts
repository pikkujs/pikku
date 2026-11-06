import {
  unwrapJobTrace,
  wrapJobTrace,
} from '../../wirings/queue/queue-trace.js'
import type { JobOptions } from '../../wirings/queue/queue.types.js'
import type { Adapter } from './dimensions.js'

export type EncodedJob = { body: string; headers: Record<string, string> }

/**
 * How one adapter puts a job on the wire, so the core run covers each wire
 * format with no broker. SIMULATED: the real adapters run the same permutations
 * in `queue-trace-conformance.ts`, behind `scripts/test-trace-adapters.sh`.
 */
export type JobTransport = {
  encode: (data: unknown, options?: JobOptions) => EncodedJob
  decode: (job: EncodedJob) => { data: any; traceparent?: string }
}

const json = (value: unknown) =>
  value === undefined ? 'null' : JSON.stringify(value)

const envelope: JobTransport = {
  encode: (data, options) => ({
    body: json(wrapJobTrace(data, options?.traceparent)),
    headers: {},
  }),
  decode: ({ body }) => unwrapJobTrace(JSON.parse(body)),
}

const headers: JobTransport = {
  encode: (data, options) => ({
    body: json(data),
    headers: options?.traceparent
      ? ({ traceparent: options.traceparent } as Record<string, string>)
      : {},
  }),
  decode: ({ body, headers }) => ({
    data: JSON.parse(body),
    traceparent: headers.traceparent,
  }),
}

export const TRANSPORTS: Record<Adapter, JobTransport> = {
  'in-memory': headers,
  bullmq: envelope,
  'pg-boss': envelope,
  nats: headers,
}
