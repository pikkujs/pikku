/**
 * Driving workflows over the same HTTP surface a client uses.
 *
 * A scenario cannot express this with `scenario.do(name, workflowName, ...)`:
 * that runs the workflow inline, as a child of the scenario's own run, and
 * yields its output. What these suites assert is about the RUN — its id, its
 * terminal status, the history the console reads back — which only the
 * `/workflow/:name/{run,start,status}` endpoints report.
 *
 * A refusal or a failure is data here, never a throw: several scenarios assert
 * that a workflow failed or was cancelled.
 */
import { pikkuScenarioStep, pollUntil, postScenarioJson, readScenarioHttpResponse, requireScenarioEnv, type ScenarioHttpResponse } from '#pikku/scenario'
import { readSseEvents } from './support.js'

/** What the workflow route answered, plus what it says about the run itself. */
export interface WorkflowRunResult extends ScenarioHttpResponse {
  workflowName: string
  runId?: string
  /** `completed`, `failed` or `cancelled`, as the caller would see it. */
  outcome: string
}

const outcomeOf = (status: number, body: unknown): string => {
  const reported = (body as { status?: string } | null)?.status
  if (reported === 'failed' || reported === 'cancelled') {
    return reported
  }
  if (status >= 200 && status < 300) {
    return 'completed'
  }
  const message = JSON.stringify(body ?? null)
  return /cancelled/i.test(message) ? 'cancelled' : 'failed'
}

const TERMINAL = ['completed', 'failed', 'cancelled']

const postWorkflow = async (
  apiUrl: string,
  workflowName: string,
  action: string,
  input: unknown,
  userId?: string
): Promise<WorkflowRunResult> => {
  const response = await postScenarioJson<{ runId?: string } | undefined>(
    `${apiUrl}/workflow/${workflowName}/${action}`,
    {
      body: { data: input ?? {} },
      headers: userId ? { 'x-user-id': userId } : {},
    }
  )
  return {
    ...response,
    workflowName,
    runId: response.body?.runId,
    outcome: outcomeOf(response.status, response.body),
  }
}

export const runsWorkflow = pikkuScenarioStep<
  { workflowName: string; input?: unknown; userId?: string },
  WorkflowRunResult
>({
  name: 'runsWorkflow',
  description: 'runs a workflow to completion over HTTP and reports the run',
  template: 'runs {workflowName}',
  default: async (
    _services,
    { workflowName, input, userId },
    { scenarioStep }
  ) =>
    postWorkflow(
      requireScenarioEnv(scenarioStep).apiUrl,
      workflowName,
      'run',
      input,
      userId
    ),
})

export const startsWorkflow = pikkuScenarioStep<
  { workflowName: string; input?: unknown },
  WorkflowRunResult
>({
  name: 'startsWorkflow',
  description: 'starts a workflow over HTTP without waiting for it',
  template: 'starts {workflowName}',
  default: async (_services, { workflowName, input }, { scenarioStep }) =>
    postWorkflow(
      requireScenarioEnv(scenarioStep).apiUrl,
      workflowName,
      'start',
      input
    ),
})

/**
 * Waits for a started run to reach a terminal status.
 *
 * `/run` answers with the workflow's output and no run id, so a scenario that
 * needs BOTH a finished run and its id has to start the run and then follow its
 * status — which is also the only honest way to learn the id, rather than
 * inheriting whatever id an earlier scenario happened to leave behind.
 */
export const awaitsWorkflowRun = pikkuScenarioStep<
  { run: WorkflowRunResult; timeoutMs?: number },
  WorkflowRunResult
>({
  name: 'awaitsWorkflowRun',
  description: 'waits for a started workflow run to reach a terminal status',
  template: 'waits for the run to finish',
  default: async (_services, { run, timeoutMs }, { scenarioStep }) => {
    if (!run.runId) {
      throw new Error(`The run was never started: ${run.serialized}`)
    }
    const apiUrl = requireScenarioEnv(scenarioStep).apiUrl
    let last = ''
    const finished = await pollUntil(
      async () => {
        const response = await readScenarioHttpResponse<
          { status?: string } | undefined
        >(
          await fetch(
            `${apiUrl}/workflow/${run.workflowName}/status/${run.runId}`
          )
        )
        last = response.serialized
        const reported = response.body?.status
        return reported && TERMINAL.includes(reported)
          ? {
              ...response,
              workflowName: run.workflowName,
              runId: run.runId,
              outcome: reported,
            }
          : undefined
      },
      { timeoutMs: timeoutMs ?? 30_000, intervalMs: 100 }
    )
    if (!finished) {
      throw new Error(
        `Run ${run.runId} never reached a terminal status: ${last}`
      )
    }
    return finished
  },
})

export const expectsWorkflowOutcome = pikkuScenarioStep<
  { run: WorkflowRunResult; outcome: string; hasRunId?: boolean },
  { outcome: string }
>({
  name: 'expectsWorkflowOutcome',
  description: 'expects a workflow run to have reached a given outcome',
  template: 'expects the run to be {outcome}',
  default: async (_services, { run, outcome, hasRunId }) => {
    if (run.outcome !== outcome) {
      throw new Error(
        `Expected the run to be ${outcome}, got ${run.outcome}: ${run.serialized}`
      )
    }
    if (hasRunId && !run.runId) {
      throw new Error(`Expected the run to report a runId: ${run.serialized}`)
    }
    return { outcome: run.outcome }
  },
})

export const expectsWorkflowOutput = pikkuScenarioStep<
  { run: WorkflowRunResult; values: Record<string, unknown> },
  { checked: number }
>({
  name: 'expectsWorkflowOutput',
  description: 'expects a workflow run to have produced the given output',
  template: 'expects the output to match',
  default: async (_services, { run, values }) => {
    const output = (run.body ?? {}) as Record<string, unknown>
    for (const [key, want] of Object.entries(values)) {
      const got = output[key]
      if (String(got) !== String(want)) {
        throw new Error(
          `Expected output ${key} to be ${JSON.stringify(want)}, got ${JSON.stringify(got)}`
        )
      }
    }
    return { checked: Object.keys(values).length }
  },
})

export interface WorkflowStreamResult {
  count: number
  /** The status carried by the last event that carried one, if any. */
  lastStatus?: string
}

/**
 * Drains the workflow status SSE stream to its end.
 *
 * The stream closes itself once the run is terminal, so reading the whole body
 * is the same thing as following it to completion — no incremental reader is
 * needed and none would survive a JSON step result.
 */
export const drainsWorkflowStatusStream = pikkuScenarioStep<
  { run: WorkflowRunResult },
  WorkflowStreamResult
>({
  name: 'drainsWorkflowStatusStream',
  description: 'reads the workflow status stream until it closes',
  template: 'streams the run status',
  default: async (_services, { run }, { scenarioStep }) => {
    if (!run.runId) {
      throw new Error(`The run was never started: ${run.serialized}`)
    }
    const response = await fetch(
      `${requireScenarioEnv(scenarioStep).apiUrl}/workflow/${run.workflowName}/status/${run.runId}/stream`,
      { headers: { accept: 'text/event-stream' } }
    )
    if (!response.ok) {
      throw new Error(`The status stream refused with ${response.status}`)
    }
    const events = await readSseEvents<{ status?: string }>(response)
    const withStatus = events.filter((event) => event.status)
    return {
      count: events.length,
      lastStatus: withStatus[withStatus.length - 1]?.status,
    }
  },
})

export const expectsWorkflowStream = pikkuScenarioStep<
  { stream: WorkflowStreamResult; minEvents?: number; lastStatus?: string },
  { count: number }
>({
  name: 'expectsWorkflowStream',
  description: 'expects the status stream to have carried the run to an end',
  template: 'expects the stream to end {lastStatus}',
  default: async (_services, { stream, minEvents, lastStatus }) => {
    if (minEvents !== undefined && stream.count < minEvents) {
      throw new Error(
        `Expected at least ${minEvents} stream event(s), got ${stream.count}`
      )
    }
    if (lastStatus !== undefined && stream.lastStatus !== lastStatus) {
      throw new Error(
        `Expected the last stream status to be ${lastStatus}, got ${stream.lastStatus ?? 'none'}`
      )
    }
    return { count: stream.count }
  },
})

export const expectsRunId = pikkuScenarioStep<
  { run: WorkflowRunResult },
  { runId: string }
>({
  name: 'expectsRunId',
  description: 'expects a started workflow to have answered with a run id',
  template: 'expects a run id',
  default: async (_services, { run }) => {
    if (!run.ok) {
      throw new Error(`The workflow was refused with ${run.status}`)
    }
    if (typeof run.runId !== 'string' || run.runId.length === 0) {
      throw new Error(`Expected a run id, got: ${run.serialized}`)
    }
    return { runId: run.runId }
  },
})
