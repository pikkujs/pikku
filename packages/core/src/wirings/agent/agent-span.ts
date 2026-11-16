import { getSingletonServices } from '../../pikku-state.js'
import { startBoundarySpan } from '../../boundary-span.js'
import {
  endFunctionSpan,
  openFunctionSpan,
  runInFunctionSpan,
} from '../../function/function-span.js'
import { createMiddlewareSessionWireProps } from '../../services/user-session-service.js'
import { childTraceWire, createTrace } from '../../trace.js'
import type { AgentStepResult } from '../../services/agent-runner-service.js'
import type { PikkuWire } from '../../types/core.types.js'
import type { SpanAttributeValue } from '../../tracer.js'
import { AgentInterruptedError } from './agent-interrupt.js'
import type { RunAgentParams } from './agent-prepare.js'

// knowledge: decisions/internals/an-agent-run-is-a-span-and-so-is-each-model-call.md

/** What the run's own code reports to its span: the run id once it exists, and a failure a stream turns into an event. */
type RunHandle = {
  setRunId(runId: string): void
  fail(error: unknown): void
}

const handles = new WeakMap<object, RunHandle>()

/** Stamps the run's id on its span once the run exists. A no-op when the run is not recorded. */
export const recordAgentRunId = (params: RunAgentParams, runId: string) =>
  handles.get(params)?.setRunId(runId)

/**
 * A stream turns a failure into an `error` event and returns instead of
 * throwing, so the span would close `ok` on a failed run. The stream reports it here.
 */
export const recordAgentRunFailure = (params: RunAgentParams, error: unknown) =>
  handles.get(params)?.fail(error)

/** What a run starts from: an agent's name and, when already known, its run id. */
export type AgentRunSpanOptions = { agentName: string; runId?: string }

/**
 * Runs one agent run (sync or streaming, a resume, a sub-agent) as a span of
 * its own: a child of the caller's span, or a root. `fn` gets a copy of `params`
 * whose `trace` is the run's, so every tool call and model call of the run is
 * its child. With no tracer, an unsampled trace or a disabled tracer `fn` gets
 * `params` untouched.
 *
 * The span closes on every path: it ends in `finally`, so a throw (including an
 * abort) can not leave it open. An interrupt ends it `ok`, as it is not a failure.
 */
export const inAgentRunSpan = async <T>(
  { agentName, runId }: AgentRunSpanOptions,
  params: RunAgentParams,
  fn: (params: RunAgentParams) => Promise<T>
): Promise<T> => {
  const { tracer, logger } = getSingletonServices()
  const runTrace = params.trace
    ? childTraceWire(params.trace).trace
    : createTrace()
  const wire = {
    functionId: agentName,
    traceId: runTrace.traceId,
    trace: runTrace,
    ...(params.sessionService
      ? createMiddlewareSessionWireProps(params.sessionService)
      : {}),
  } as unknown as PikkuWire
  const open = openFunctionSpan(tracer, logger, wire, 'agent', {
    'pikku.wire.type': 'agent',
    'pikku.agent.name': agentName,
    'pikku.trace.root': !params.trace,
    ...(runId ? { 'pikku.agent.run_id': runId } : {}),
  })
  if (!open) return fn(params)

  // Hand the run's trace down without touching the caller's params: a sub-agent
  // shares them, and `anonymousOwnerResourceId` is minted on whichever object a
  // run holds, so that one field stays the caller's own.
  const scoped: RunAgentParams = { ...params, trace: runTrace }
  Object.defineProperty(scoped, 'anonymousOwnerResourceId', {
    get: () => params.anonymousOwnerResourceId,
    set: (value: string | undefined) => {
      params.anonymousOwnerResourceId = value
    },
    enumerable: true,
  })
  let failure: { error: unknown } | undefined
  handles.set(scoped, {
    setRunId(id) {
      try {
        open.span.setAttribute('pikku.agent.run_id', id)
      } catch {}
    },
    fail(error) {
      failure ??= { error }
    },
  })
  const startedAt = performance.now()
  try {
    return await runInFunctionSpan(open, () => fn(scoped))
  } catch (error) {
    if (!(error instanceof AgentInterruptedError)) failure ??= { error }
    throw error
  } finally {
    endFunctionSpan(open, Math.round(performance.now() - startedAt), failure)
  }
}

/** A model name that is safe to put on a span: an identifier, never free text. */
const SAFE_MODEL = /^[A-Za-z0-9_.:@/-]{1,128}$/

const modelAttributes = (model: string) => {
  const attributes: Record<string, SpanAttributeValue> = {
    'gen_ai.operation.name': 'chat',
  }
  if (SAFE_MODEL.test(model)) {
    attributes['gen_ai.request.model'] = model
    const slash = model.indexOf('/')
    if (slash > 0) attributes['gen_ai.provider.name'] = model.slice(0, slash)
  }
  return attributes
}

const resultAttributes = (result: AgentStepResult) => {
  const attributes: Record<string, SpanAttributeValue> = {}
  const { inputTokens, outputTokens } = result.usage ?? {}
  if (Number.isFinite(inputTokens)) {
    attributes['gen_ai.usage.input_tokens'] = inputTokens
  }
  if (Number.isFinite(outputTokens)) {
    attributes['gen_ai.usage.output_tokens'] = outputTokens
  }
  if (typeof result.finishReason === 'string') {
    // OTel names an array; a span attribute here is a scalar and a step ends once.
    attributes['gen_ai.response.finish_reasons'] = result.finishReason
  }
  if (
    typeof result.cost === 'number' &&
    Number.isFinite(result.cost) &&
    result.cost >= 0
  ) {
    attributes['pikku.ai.cost_usd'] = result.cost
  }
  return attributes
}

/**
 * Wraps one model call (a step of the loop) in a `client` span under the run's.
 * Only the model name, token counts, finish reason and, when the runner could
 * read it, the cost are recorded: never a prompt, a reply or tool arguments. A
 * failure keeps the error class alone, as a provider error can carry a URL or
 * part of a request.
 */
export const inModelCallSpan = async (
  params: RunAgentParams,
  model: string,
  call: () => Promise<AgentStepResult>
): Promise<AgentStepResult> => {
  const { tracer, logger } = getSingletonServices()
  const boundary = startBoundarySpan(
    // A tracer nothing is listening to opens no span, as it does not for a function.
    { tracer: tracer?.active === false ? undefined : tracer, logger },
    { trace: params.trace },
    'chat',
    'client',
    modelAttributes(model)
  )
  try {
    const result = await call()
    boundary.end(undefined, resultAttributes(result))
    return result
  } catch (error) {
    boundary.end({ error })
    throw error
  }
}
