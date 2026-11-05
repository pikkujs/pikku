import {
  continueTrace,
  createTrace,
  formatTraceparent,
  parseTraceparent,
  tracedLogger,
  type TraceContext,
} from '../../trace.js'
import type { Logger } from '../../services/logger.js'
import type { WorkflowRunWire } from './workflow.types.js'

/**
 * The wire a run is stored with. It always holds a valid `traceparent`, so a
 * run started from a wire with no trace still has one to keep through every
 * pass, restart and recovery.
 *
 * knowledge: decisions/internals/a-workflow-run-owns-its-trace.md
 */
export const withRunTrace = (wire: WorkflowRunWire): WorkflowRunWire =>
  parseTraceparent(wire?.traceparent)
    ? wire
    : { ...wire, traceparent: formatTraceparent(createTrace()) }

/**
 * The wire fields for one hop of a run: the run's trace with a new span, so
 * each attempt of a step is its own span in the same trace. Empty for a run
 * that was stored without a trace.
 */
export const runTraceWire = (
  traceparent: string | undefined
): { traceId?: string; trace?: TraceContext } => {
  if (!traceparent) return {}
  const trace = continueTrace(traceparent)
  return { traceId: trace.traceId, trace }
}

/** `logger` on the trace of the run stored with `wire`. */
export const runLogger = (logger: Logger, wire: WorkflowRunWire): Logger =>
  tracedLogger(logger, parseTraceparent(wire?.traceparent)?.traceId)
