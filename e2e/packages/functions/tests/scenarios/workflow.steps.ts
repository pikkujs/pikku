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
import { pikkuScenarioStep } from '#pikku/workflow/pikku-workflow-types.gen.js'
import { apiUrlOf } from './agent-transport.js'

export interface WorkflowRunResult {
  status: number
  ok: boolean
  workflowName: string
  runId?: string
  /** `completed`, `failed` or `cancelled`, as the caller would see it. */
  outcome: string
  body: unknown
  serialized: string
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

const readBody = async (response: Response): Promise<unknown> => {
  const text = await response.text()
  try {
    return text ? JSON.parse(text) : null
  } catch {
    return text
  }
}

const postWorkflow = async (
  apiUrl: string,
  workflowName: string,
  action: string,
  input: unknown
): Promise<WorkflowRunResult> => {
  const response = await fetch(`${apiUrl}/workflow/${workflowName}/${action}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ data: input ?? {} }),
  })
  const body = await readBody(response)
  return {
    status: response.status,
    ok: response.ok,
    workflowName,
    runId: (body as { runId?: string } | null)?.runId,
    outcome: outcomeOf(response.status, body),
    body,
    serialized: JSON.stringify(body ?? null),
  }
}

export const runsWorkflow = pikkuScenarioStep<
  { workflowName: string; input?: unknown },
  WorkflowRunResult
>({
  name: 'runsWorkflow',
  description: 'runs a workflow to completion over HTTP and reports the run',
  template: 'runs {workflowName}',
  func: async (_services, { workflowName, input }, { scenarioStep }) =>
    postWorkflow(apiUrlOf(scenarioStep.env), workflowName, 'run', input),
})

export const startsWorkflow = pikkuScenarioStep<
  { workflowName: string; input?: unknown },
  WorkflowRunResult
>({
  name: 'startsWorkflow',
  description: 'starts a workflow over HTTP without waiting for it',
  template: 'starts {workflowName}',
  func: async (_services, { workflowName, input }, { scenarioStep }) =>
    postWorkflow(apiUrlOf(scenarioStep.env), workflowName, 'start', input),
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
  func: async (_services, { run, timeoutMs }, { scenarioStep }) => {
    if (!run.runId) {
      throw new Error(`The run was never started: ${run.serialized}`)
    }
    const apiUrl = apiUrlOf(scenarioStep.env)
    const deadline = Date.now() + (timeoutMs ?? 30_000)
    let body: unknown = null
    let status = 0
    while (Date.now() < deadline) {
      const response = await fetch(
        `${apiUrl}/workflow/${run.workflowName}/status/${run.runId}`
      )
      status = response.status
      body = await readBody(response)
      const reported = (body as { status?: string } | null)?.status
      if (reported && TERMINAL.includes(reported)) {
        return {
          status,
          ok: response.ok,
          workflowName: run.workflowName,
          runId: run.runId,
          outcome: reported,
          body,
          serialized: JSON.stringify(body ?? null),
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
    throw new Error(
      `Run ${run.runId} never reached a terminal status: ${JSON.stringify(body ?? null)}`
    )
  },
})

export const expectsWorkflowOutcome = pikkuScenarioStep<
  { run: WorkflowRunResult; outcome: string; hasRunId?: boolean },
  { outcome: string }
>({
  name: 'expectsWorkflowOutcome',
  description: 'expects a workflow run to have reached a given outcome',
  template: 'expects the run to be {outcome}',
  func: async (_services, { run, outcome, hasRunId }) => {
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
