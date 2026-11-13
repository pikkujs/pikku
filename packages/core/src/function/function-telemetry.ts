import type { TraceContext } from '../trace.js'
import { markWorkflowStep, workflowStepOfTrace } from '../workflow-step-mark.js'

export type FunctionSpans = 'off' | 'on' | 'always' | { sample: number }

export type FunctionTelemetry = {
  spans?: FunctionSpans
}

const describe = (value: unknown): string => {
  try {
    return JSON.stringify(value) ?? String(value)
  } catch {
    return String(value)
  }
}

export const assertFunctionTelemetry = (
  funcName: string,
  telemetry: unknown
): void => {
  if (telemetry === undefined) return
  const fail = (why: string) => {
    throw new Error(`Function '${funcName}' has an invalid telemetry: ${why}`)
  }
  if (telemetry === null || typeof telemetry !== 'object') {
    fail(`expected an object, got ${describe(telemetry)}`)
  }
  for (const key of Object.keys(telemetry as object)) {
    if (key !== 'spans') fail(`unknown key '${key}'`)
  }
  const spans = (telemetry as { spans?: unknown }).spans
  if (spans === undefined || spans === 'off' || spans === 'on') return
  if (spans === 'always') return
  if (spans !== null && typeof spans === 'object') {
    const keys = Object.keys(spans)
    const sample = (spans as { sample?: unknown }).sample
    if (
      keys.length === 1 &&
      keys[0] === 'sample' &&
      typeof sample === 'number' &&
      sample >= 0 &&
      sample <= 1
    ) {
      return
    }
    fail(`spans.sample must be a number from 0 to 1, got ${describe(spans)}`)
  }
  fail(
    `spans must be 'off', 'on', 'always' or { sample: number }, got ${describe(spans)}`
  )
}

const withSampled = (
  trace: TraceContext,
  sampled: boolean,
  parentSpanId: string | undefined
): TraceContext => {
  const next: TraceContext = {
    traceId: trace.traceId,
    spanId: trace.spanId,
    ...(parentSpanId ? { parentSpanId } : {}),
    sampled,
  }
  const step = workflowStepOfTrace(trace)
  if (step) markWorkflowStep(next, step)
  return next
}

export const decideFunctionTrace = (
  spans: FunctionSpans | undefined,
  trace: TraceContext,
  random: () => number = Math.random
): TraceContext => {
  if (spans === undefined || spans === 'on') return trace
  if (spans === 'off') {
    return trace.sampled ? withSampled(trace, false, trace.parentSpanId) : trace
  }
  if (spans === 'always') {
    return trace.sampled ? trace : withSampled(trace, true, undefined)
  }
  if (typeof spans === 'object' && typeof spans.sample === 'number') {
    if (trace.parentSpanId !== undefined || !trace.sampled) return trace
    return random() < spans.sample
      ? trace
      : withSampled(trace, false, undefined)
  }
  return trace
}
