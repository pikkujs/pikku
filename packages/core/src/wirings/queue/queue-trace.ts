const TRACEPARENT_KEY = '__pikkuTraceparent'
const IDENTITY_KEY = '__pikkuUserId'
const ENVELOPE_KEYS = new Set([TRACEPARENT_KEY, IDENTITY_KEY, 'data'])

/**
 * Puts a job's `traceparent` and signed identity claim next to its payload, for
 * queues with no per-message metadata that survives a retry. Applied by the
 * adapter, below `SignedQueueService`, so the signature still covers `data`.
 * A job with neither is sent as it is.
 */
// knowledge: decisions/internals/bullmq-and-pg-boss-carry-traceparent-in-a-payload-envelope.md
export const wrapJobTrace = (
  data: unknown,
  traceparent?: string,
  pikkuUserId?: string
): any =>
  traceparent || pikkuUserId
    ? {
        ...(traceparent ? { [TRACEPARENT_KEY]: traceparent } : {}),
        ...(pikkuUserId ? { [IDENTITY_KEY]: pikkuUserId } : {}),
        data,
      }
    : data

const isOptionalString = (value: unknown) =>
  value === undefined || typeof value === 'string'

const isEnvelope = (payload: any): boolean =>
  typeof payload === 'object' &&
  payload !== null &&
  (payload[TRACEPARENT_KEY] !== undefined ||
    payload[IDENTITY_KEY] !== undefined) &&
  isOptionalString(payload[TRACEPARENT_KEY]) &&
  isOptionalString(payload[IDENTITY_KEY]) &&
  Object.keys(payload).every((key) => ENVELOPE_KEYS.has(key))

/**
 * Undoes {@link wrapJobTrace}. A payload without the envelope is the job's data
 * as enqueued. `pikkuUserId` is the unverified claim: only `runQueueJob` may
 * turn it into an identity.
 */
export const unwrapJobTrace = (
  payload: any
): { data: any; traceparent?: string; pikkuUserId?: string } => {
  if (!isEnvelope(payload)) return { data: payload }
  const traceparent = payload[TRACEPARENT_KEY]
  const pikkuUserId = payload[IDENTITY_KEY]
  return {
    data: payload.data,
    ...(traceparent !== undefined ? { traceparent } : {}),
    ...(pikkuUserId !== undefined ? { pikkuUserId } : {}),
  }
}
