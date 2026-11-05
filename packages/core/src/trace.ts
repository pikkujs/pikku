import type { Logger } from './services/logger.js'

/** One invocation's place in a W3C trace. */
export type TraceContext = {
  /** 32 lowercase hex characters, shared by every hop of the trace. */
  traceId: string
  /** 16 lowercase hex characters, identifying this invocation. */
  spanId: string
  /** The caller's span, when the trace was continued from another hop. */
  parentSpanId?: string
  sampled: boolean
}

const TRACE_ID = /^[0-9a-f]{32}$/
const TRACEPARENT =
  /^([0-9a-f]{2})-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})(-.*)?$/
const ALL_ZERO = /^0+$/

const randomHex = (bytes: number): string => {
  const hex = Array.from(
    globalThis.crypto.getRandomValues(new Uint8Array(bytes)),
    (byte) => byte.toString(16).padStart(2, '0')
  ).join('')
  // All zeroes means "invalid" in W3C, so it can never be issued.
  return ALL_ZERO.test(hex) ? randomHex(bytes) : hex
}

/** Whether `value` is a usable trace id: 32 lowercase hex, not all zero. */
export const isValidTraceId = (value: unknown): value is string =>
  typeof value === 'string' && TRACE_ID.test(value) && !ALL_ZERO.test(value)

/** A new trace, or a new span in `traceId` when one is given. */
export const createTrace = (traceId?: string): TraceContext => ({
  traceId: traceId ?? randomHex(16),
  spanId: randomHex(8),
  sampled: true,
})

/**
 * Reads a W3C `traceparent` header. Returns `undefined` for anything malformed,
 * an all-zero id, version `ff`, or a version `00` header with extra fields.
 */
export const parseTraceparent = (
  header: unknown
):
  | (Pick<TraceContext, 'traceId' | 'sampled'> & { parentSpanId: string })
  | undefined => {
  if (typeof header !== 'string') return undefined
  const match = TRACEPARENT.exec(header)
  if (!match) return undefined
  const [, version, traceId, parentSpanId, flags, extra] = match
  if (version === 'ff' || (version === '00' && extra !== undefined)) {
    return undefined
  }
  if (ALL_ZERO.test(traceId!) || ALL_ZERO.test(parentSpanId!)) return undefined
  return {
    traceId: traceId!,
    parentSpanId: parentSpanId!,
    sampled: (Number.parseInt(flags!, 16) & 1) === 1,
  }
}

/** Formats `trace` as the `traceparent` of a call it makes: it is the parent. */
export const formatTraceparent = (
  trace: Pick<TraceContext, 'traceId' | 'spanId' | 'sampled'>
): string =>
  `00-${trace.traceId}-${trace.spanId}-${trace.sampled ? '01' : '00'}`

/**
 * Resolves the trace for an inbound HTTP request: a valid `traceId` from the
 * runtime, then the `traceparent` header if the deployment opted in, then a new
 * trace.
 *
 * knowledge: decisions/security/inbound-traceparent-is-ignored-until-the-caller-is-authenticated.md
 */
export const resolveHTTPTrace = (
  readHeader: () => unknown,
  logger: Logger,
  {
    traceId,
    trustInboundTraceparent,
  }: {
    traceId?: string
    trustInboundTraceparent?: boolean
  }
): TraceContext => {
  if (traceId !== undefined) {
    if (isValidTraceId(traceId)) return createTrace(traceId)
    logger.warn('Ignoring a traceId that is not 32 lowercase hex characters')
  }
  if (trustInboundTraceparent) {
    let header: unknown
    try {
      header = readHeader()
    } catch {}
    const inbound = parseTraceparent(header)
    if (inbound) return { ...inbound, spanId: randomHex(8) }
  }
  return createTrace()
}

/**
 * Starts this hop's span in the trace a job, scheduled task or workflow run
 * carried, or a new trace when it carried nothing usable. A carried value needs
 * no signature: it names a trace, never an identity.
 */
export const continueTrace = (traceparent: unknown): TraceContext => {
  const carried = parseTraceparent(traceparent)
  return carried ? { ...carried, spanId: randomHex(8) } : createTrace()
}

/**
 * Continues the caller's trace on an already-running invocation. Only for a
 * caller that has been authenticated, and in place because the HTTP runner
 * holds `wire.trace` for its error response.
 */
export const adoptTraceparent = (
  wire: { traceId?: string; trace?: TraceContext },
  header: unknown
): void => {
  const inbound = parseTraceparent(header)
  if (!inbound) return
  wire.traceId = inbound.traceId
  wire.trace = Object.assign(
    wire.trace ?? createTrace(inbound.traceId),
    inbound
  )
}

/** The `traceparent` for a call made from `wire`, if it is in a W3C trace. */
export const outgoingTraceparent = (wire: {
  trace?: TraceContext
}): string | undefined => wire.trace && formatTraceparent(wire.trace)
