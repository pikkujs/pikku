import type { TraceContext } from './trace.js'

/** The workflow run and step a span belongs to. */
export type WorkflowStepTrace = { runId: string; stepId: string }

const stepTraces = new WeakMap<TraceContext, WorkflowStepTrace>()

/**
 * Remembers that `trace` is the span of one workflow step, against the object
 * itself: the function runner can then tell the step's own span from a call the
 * step's function makes, which copies the wire but gets a trace of its own.
 *
 * knowledge: decisions/internals/a-workflow-run-owns-its-trace.md
 */
export const markWorkflowStep = (
  trace: TraceContext,
  step: WorkflowStepTrace
): void => {
  stepTraces.set(trace, step)
}

/** The step `trace` was marked with by {@link markWorkflowStep}, if any. */
export const workflowStepOfTrace = (
  trace: TraceContext
): WorkflowStepTrace | undefined => stepTraces.get(trace)
