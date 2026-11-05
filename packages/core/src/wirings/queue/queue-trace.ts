const ENVELOPE_KEY = '__pikkuTraceparent'

/**
 * Carries `traceparent` in the payload of a backend with no per-job metadata
 * that survives a retry. Applied by the adapter, below `SignedQueueService`, so
 * `data` keeps the bytes the identity signature binds.
 *
 * knowledge: decisions/internals/bullmq-and-pg-boss-carry-traceparent-in-a-payload-envelope.md
 */
export const wrapJobTrace = (data: unknown, traceparent?: string): any =>
  traceparent ? { [ENVELOPE_KEY]: traceparent, data } : data

/**
 * Undoes {@link wrapJobTrace}. A payload without the envelope, such as a job
 * enqueued before tracing or with no trace, comes back as it was sent.
 */
export const unwrapJobTrace = (
  payload: any
): { data: any; traceparent?: string } => {
  const traceparent = payload?.[ENVELOPE_KEY]
  return typeof traceparent === 'string' && Object.keys(payload).length === 2
    ? { data: payload.data, traceparent }
    : { data: payload }
}
