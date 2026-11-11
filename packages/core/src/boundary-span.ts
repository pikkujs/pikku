import type { Logger } from './services/logger.js'
import {
  childTraceWire,
  formatTraceparent,
  outgoingTraceparent,
  type TraceContext,
} from './trace.js'
import {
  nowUnixNano,
  redactSpanError,
  type Span,
  type SpanAttributeValue,
  type Tracer,
} from './tracer.js'

// knowledge: decisions/internals/the-function-runner-owns-the-span-middleware-cannot.md
// A tracer that throws is logged once and then left alone for the process.
const disabled = new WeakSet<Tracer>()

export const isTracerDisabled = (tracer: Tracer): boolean =>
  disabled.has(tracer)

export const disableTracer = (
  tracer: Tracer,
  logger: Logger,
  error: unknown
) => {
  if (disabled.has(tracer)) return
  disabled.add(tracer)
  try {
    logger.warn(
      `The tracer threw and is disabled for this process: ${redactSpanError(error).message}`
    )
  } catch {
    // Reporting the failure must not become a second one.
  }
}

// knowledge: decisions/internals/a-job-inherits-the-trace-of-the-function-that-enqueued-it.md
/** A span for a call that leaves the function: the one that is open until the call settles. */
export type BoundarySpan = {
  /** What to stamp on the outgoing call: the boundary span if one is open, else the wire's. */
  traceparent: string | undefined
  /** Closes the span with the call's outcome. Idempotent; never throws. */
  end(failure?: { error: unknown }): void
}

const NO_BOUNDARY: Omit<BoundarySpan, 'traceparent'> = { end() {} }

/**
 * Opens a `producer` or `client` span, a child of the span of `wire`, for a
 * call that leaves the function (a queue publish, a scheduled RPC, a remote
 * RPC). With no tracer, an unsampled trace or a disabled tracer it records
 * nothing and `traceparent` is the wire's own, as before. Never throws.
 *
 * `attributes` must be framework facts from the allow-list: names, never
 * payloads, arguments or URLs.
 */
export const startBoundarySpan = (
  tracing: { tracer?: Tracer; logger?: Logger } | undefined,
  wire: { trace?: TraceContext },
  name: string,
  kind: 'producer' | 'client',
  attributes: Record<string, SpanAttributeValue>
): BoundarySpan => {
  const own = outgoingTraceparent(wire)
  const tracer = tracing?.tracer
  const logger = tracing?.logger
  if (!tracer || !logger || !wire.trace?.sampled || isTracerDisabled(tracer)) {
    return { traceparent: own, ...NO_BOUNDARY }
  }
  let span: Span
  let context: TraceContext
  try {
    context = childTraceWire(wire.trace).trace
    span = tracer.startSpan(name, context, {
      kind,
      attributes,
      startTimeUnixNano: nowUnixNano(),
    })
  } catch (error) {
    disableTracer(tracer, logger, error)
    return { traceparent: own, ...NO_BOUNDARY }
  }
  let ended = false
  return {
    traceparent: formatTraceparent(context),
    end(failure) {
      if (ended) return
      ended = true
      if (isTracerDisabled(tracer)) return
      try {
        if (failure) {
          const { type, text } = redactSpanError(failure.error)
          span.addEvent('exception', {
            'exception.type': type,
            'exception.message': text,
          })
          span.end({ code: 'error', error: failure.error })
        } else {
          span.end({ code: 'ok' })
        }
      } catch (error) {
        disableTracer(tracer, logger, error)
      }
    },
  }
}

const isPromiseLike = (value: unknown): value is PromiseLike<unknown> =>
  typeof (value as PromiseLike<unknown> | undefined)?.then === 'function'

/**
 * Calls `call`, closing `boundary` when what it returns settles. The caller
 * gets exactly what `call` returned or threw.
 */
export const endBoundaryWhenSettled = <T>(
  boundary: BoundarySpan,
  call: () => T
): T => {
  let result: T
  try {
    result = call()
  } catch (error) {
    boundary.end({ error })
    throw error
  }
  if (isPromiseLike(result)) {
    result.then(
      () => boundary.end(),
      (error: unknown) => boundary.end({ error })
    )
  } else {
    boundary.end()
  }
  return result
}
