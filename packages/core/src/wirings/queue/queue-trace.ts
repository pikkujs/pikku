const ENVELOPE_KEY = '__pikkuTraceparent'

const isEnvelope = (payload: any): boolean =>
  typeof payload?.[ENVELOPE_KEY] === 'string' &&
  Object.keys(payload).length === 2

/**
 * Carries `traceparent` in the payload of a backend with no per-job metadata
 * that survives a retry. Applied by the adapter, below `SignedQueueService`, so
 * `data` keeps the bytes the identity signature binds. Data that happens to look
 * like an envelope is wrapped even with no trace, or a worker would unwrap it.
 *
 * knowledge: decisions/internals/bullmq-and-pg-boss-carry-traceparent-in-a-payload-envelope.md
 */
export const wrapJobTrace = (data: unknown, traceparent?: string): any =>
  traceparent || isEnvelope(data)
    ? { [ENVELOPE_KEY]: traceparent ?? '', data }
    : data

/**
 * Undoes {@link wrapJobTrace}. A payload without the envelope, such as a job
 * enqueued before tracing or with no trace, comes back as it was sent.
 */
export const unwrapJobTrace = (
  payload: any
): { data: any; traceparent?: string } => {
  if (!isEnvelope(payload)) return { data: payload }
  const { [ENVELOPE_KEY]: traceparent, data } = payload
  return traceparent ? { data, traceparent } : { data }
}
