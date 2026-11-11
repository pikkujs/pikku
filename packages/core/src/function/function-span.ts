import { getErrorResponse } from '../errors/error-handler.js'
import type { Logger } from '../services/logger.js'
import type { PikkuWire, PikkuWiringTypes } from '../types/core.types.js'
import {
  nowUnixNano,
  redactSpanError,
  type Span,
  type SpanAttributeValue,
  type SpanKind,
  type Tracer,
} from '../tracer.js'

// knowledge: decisions/internals/the-function-runner-owns-the-span-middleware-cannot.md
// A tracer that throws is logged once and then left alone for the process.
const disabled = new WeakSet<Tracer>()

const disable = (tracer: Tracer, logger: Logger, error: unknown) => {
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

const KINDS: Partial<Record<PikkuWiringTypes, SpanKind>> = {
  http: 'server',
  channel: 'server',
  mcp: 'server',
  cli: 'server',
  gateway: 'server',
  queue: 'consumer',
  scheduler: 'consumer',
  workflow: 'consumer',
  trigger: 'consumer',
}

export type FunctionSpan = {
  span: Span
  wireType: PikkuWiringTypes
  tracer: Tracer
  logger: Logger
  wire: PikkuWire
}

/**
 * Opens the span of one invocation. Returns undefined when nothing is recorded:
 * no tracer, an unsampled trace, a tracer already disabled, or a tracer that
 * threw while opening. Never throws.
 */
export const openFunctionSpan = (
  tracer: Tracer | undefined,
  logger: Logger,
  wire: PikkuWire,
  wireType: PikkuWiringTypes,
  attributes: Record<string, SpanAttributeValue>
): FunctionSpan | undefined => {
  const trace = wire.trace
  if (!tracer || !trace?.sampled || disabled.has(tracer)) return undefined
  try {
    const span = tracer.startSpan(wire.functionId ?? '', trace, {
      kind: KINDS[wireType] ?? 'internal',
      attributes,
      startTimeUnixNano: nowUnixNano(),
    })
    return { span, wireType, tracer, logger, wire }
  } catch (error) {
    disable(tracer, logger, error)
    return undefined
  }
}

/**
 * The facts only known once the invocation is over, from the allow-list. Each
 * read is guarded on its own: one throwing accessor costs that attribute, not
 * the span.
 */
const endAttributes = (
  wire: PikkuWire,
  wireType: PikkuWiringTypes,
  durationMs: number | undefined,
  failure: { error: unknown } | undefined
): Record<string, SpanAttributeValue> => {
  const attributes: Record<string, SpanAttributeValue> = {}
  const set = (key: string, read: () => unknown) => {
    try {
      const value = read()
      if (
        typeof value === 'string' ||
        typeof value === 'number' ||
        typeof value === 'boolean'
      ) {
        attributes[key] = value
      }
    } catch {
      // This attribute is lost; the span is not.
    }
  }
  set('pikku.function.duration_ms', () => durationMs)
  set('pikku.user.id', () => readUserId(wire))
  set('pikku.org.id', () => wire.session?.orgId)
  // A nested call runs on a copy of its caller's wire, so a transport's fields
  // are only this span's own when this invocation arrived by that transport.
  if (wireType === 'http' && wire.http) {
    const http = wire.http
    set('http.request.method', () => http.request?.method())
    set('http.route', () => wire.wireId)
    // The error response is written after the runner returns, so a failure's
    // status is what the HTTP layer is about to write, not what is on the
    // response yet.
    set('http.response.status_code', () =>
      failure
        ? (getErrorResponse(failure.error as Error)?.status ?? 500)
        : http.response?.statusCode
    )
  }
  if (wireType === 'queue' && wire.queue) {
    const queue = wire.queue
    set('pikku.queue.name', () => queue.queueName)
    set('pikku.queue.job_id', () => queue.jobId)
  }
  if (wireType === 'scheduler') {
    set('pikku.scheduler.task', () => wire.scheduledTask?.name)
  }
  if (wireType === 'workflow') {
    set('pikku.workflow.name', () => wire.workflow?.name)
    set('pikku.workflow.run_id', () => wire.workflow?.runId)
    set('pikku.workflow.step', () => wire.workflowStep?.stepId)
  }
  if (wireType === 'channel') {
    set('pikku.channel.id', () => wire.channel?.channelId)
  }
  if (wireType === 'mcp') set('pikku.mcp.tool', () => wire.wireId)
  return attributes
}

const readUserId = (wire: PikkuWire): string | undefined => {
  const id = (wire as { pikkuUserId?: unknown }).pikkuUserId
  return typeof id === 'string' ? id : undefined
}

/**
 * Closes the span with the invocation's outcome. Never throws and never alters
 * the error the caller is about to rethrow.
 */
export const endFunctionSpan = (
  open: FunctionSpan,
  durationMs: number | undefined,
  failure?: { error: unknown }
) => {
  const { span, wireType, tracer, logger, wire } = open
  if (disabled.has(tracer)) return
  // Gathering is guarded per read; only the tracer's own calls can disable it.
  const attributes = endAttributes(wire, wireType, durationMs, failure)
  try {
    for (const [key, value] of Object.entries(attributes)) {
      span.setAttribute(key, value)
    }
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
    disable(tracer, logger, error)
  }
}

/**
 * Runs `fn` inside the span when the tracer can scope it (`runInSpan`), else
 * just runs it. `fn` runs exactly once and its result or error is what the
 * caller sees, whatever the tracer does; a tracer that throws, or returns
 * without running `fn`, is disabled.
 */
export const runInFunctionSpan = <T>(
  open: FunctionSpan | undefined,
  fn: () => Promise<T>
): Promise<T> => {
  if (!open?.tracer.runInSpan || disabled.has(open.tracer)) return fn()
  let started = false
  let outcome: Promise<T> | undefined
  // Whoever calls first starts fn; any later call gets the same promise. A
  // synchronous throw becomes a rejection, like an async function's.
  const once = (): Promise<T> => {
    if (!started) {
      started = true
      try {
        outcome = fn()
      } catch (error) {
        outcome = Promise.reject(error)
      }
    }
    return outcome as Promise<T>
  }
  try {
    const result = open.tracer.runInSpan(open.span, once)
    // Whatever the tracer returns, a failure of its own is swallowed: it is
    // disabled, and the function's outcome is the only thing the caller sees.
    Promise.resolve(result).catch((error) => {
      // The function's own rejection passing through is not the tracer's fault.
      if (!outcome) return disable(open.tracer, open.logger, error)
      outcome.then(
        () => disable(open.tracer, open.logger, error),
        (own) => {
          if (own !== error) disable(open.tracer, open.logger, error)
        }
      )
    })
    if (!started) {
      disable(
        open.tracer,
        open.logger,
        new Error('runInSpan returned without running the function')
      )
    }
    return once()
  } catch (error) {
    disable(open.tracer, open.logger, error)
    return once()
  }
}
