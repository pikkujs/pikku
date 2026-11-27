import { getSingletonServices } from '../../pikku-state.js'
import type { PikkuRPC } from '../rpc/rpc-types.js'
import { ChildWorkflowStartedException } from './workflow-errors.js'
import { childRunFailure } from './workflow-compensation.js'
import { WORKFLOW_TERMINAL_STATES, isRunStopped } from './workflow-constants.js'
import { runningStepLease } from './workflow-step-lease.js'
import { unlessSuperseded } from './workflow-step-retry.js'
import type {
  StepState,
  WorkflowRun,
  WorkflowRunWire,
} from './workflow.types.js'

export interface ChildStepApi {
  startWorkflow(
    name: string,
    input: unknown,
    wire: WorkflowRunWire,
    rpcService: PikkuRPC,
    options?: {
      inline?: boolean
      onRunCreated?: (runId: string) => Promise<void>
    }
  ): Promise<{ runId: string }>
  setStepChildRunId(stepId: string, childRunId: string): Promise<boolean>
  getRun(id: string): Promise<WorkflowRun | null>
  cancelRun(runId: string, rpcService: PikkuRPC): Promise<unknown>
}

/**
 * Start the child run of a parent step, linked to it before it can do anything.
 * `cancelRun` marks the parent before it reads the parent's steps, and the
 * parent is read here after the link is written. So a cancel either finds the
 * child on the step, or is seen here, and the child is cancelled unstarted.
 */
export const startLinkedChildRun = (
  api: ChildStepApi,
  parent: { runId: string; stepId: string },
  workflowName: string,
  data: unknown,
  wire: WorkflowRunWire,
  rpcService: PikkuRPC,
  inline: boolean
): Promise<{ runId: string }> =>
  api.startWorkflow(workflowName, data, wire, rpcService, {
    inline,
    onRunCreated: async (childRunId) => {
      const linked = await api.setStepChildRunId(parent.stepId, childRunId)
      const run = linked ? await api.getRun(parent.runId) : null
      if (!run || isRunStopped(run.status)) {
        await api.cancelRun(childRunId, rpcService)
      }
    },
  })

export const runInlineChildStep = async (
  api: ChildStepApi & {
    awaitRunEnd(childRunId: string): Promise<WorkflowRun>
  },
  runId: string,
  stepId: string,
  workflowName: string,
  data: unknown,
  rpcService: PikkuRPC,
  parentWire: WorkflowRunWire | undefined
): Promise<unknown> => {
  const { runId: childRunId } = await startLinkedChildRun(
    api,
    { runId, stepId },
    workflowName,
    data,
    {
      type: 'workflow',
      id: workflowName,
      parentRunId: runId,
      pikkuUserId: parentWire?.pikkuUserId,
      traceparent: parentWire?.traceparent,
    },
    rpcService,
    true
  )
  const childRun = await api.awaitRunEnd(childRunId)
  const failure = childRunFailure(childRun)
  if (failure) throw failure
  return childRun.output
}

export const startQueuedChildStep = async (
  api: ChildStepApi,
  runId: string,
  stepId: string,
  workflowName: string,
  data: unknown,
  rpcService: PikkuRPC,
  parentWire: WorkflowRunWire | undefined
): Promise<unknown> => {
  const shouldInline = !getSingletonServices()?.queueService
  const { runId: childRunId } = await startLinkedChildRun(
    api,
    { runId, stepId },
    workflowName,
    data,
    {
      type: 'workflow',
      id: workflowName,
      parentRunId: runId,
      parentStepId: stepId,
      pikkuUserId: parentWire?.pikkuUserId,
      traceparent: parentWire?.traceparent,
    },
    rpcService,
    shouldInline
  )
  return queuedChildOutcome(api, runId, stepId, childRunId, shouldInline)
}

/**
 * What the dispatch of a child step ends with: the child's outcome where it ran
 * in-process, or else the exception that parks the step on it. A child that was
 * cancelled unstarted has no outcome left to hand back later.
 */
export const queuedChildOutcome = async (
  api: Pick<ChildStepApi, 'getRun'>,
  runId: string,
  stepId: string,
  childRunId: string,
  inline: boolean
): Promise<unknown> => {
  const childRun = await api.getRun(childRunId)
  if (!inline && childRun?.status !== 'cancelled') {
    throw new ChildWorkflowStartedException(runId, stepId, childRunId)
  }
  const failure = childRun && childRunFailure(childRun)
  if (failure) throw failure
  return childRun?.output
}

/**
 * How long a `cancelled` child is left alone: `cancelRun` writes that status
 * before it moves a child with work to undo to `compensating`.
 */
const CANCELLED_CHILD_SETTLE_MS = 30_000

/**
 * Give every step still parked on a child that has settled the child's outcome.
 * Replay cannot do this: it would run the step again and start a second child.
 */
export const handBackSettledChildren = async (
  api: {
    getRun(id: string): Promise<WorkflowRun | null>
    getRunSteps(runId: string): Promise<Array<StepState & { stepName: string }>>
    getStepState(runId: string, stepName: string): Promise<StepState>
    setStepResult(
      stepId: string,
      result: unknown,
      attempt?: number
    ): Promise<void>
    setStepError(stepId: string, error: Error, attempt?: number): Promise<void>
  },
  runId: string
): Promise<void> => {
  for (const listed of await api.getRunSteps(runId)) {
    if (!isParkedOnChild(listed)) continue
    // One read, so the child and the attempt it is handed to belong together.
    const step = await api.getStepState(runId, listed.stepName)
    if (!isParkedOnChild(step) || runningStepLease(step) === 'held') continue
    const child = await api.getRun(step.childRunId!)
    if (!child || !WORKFLOW_TERMINAL_STATES.has(child.status)) continue
    if (
      child.status === 'cancelled' &&
      Date.now() - child.updatedAt.getTime() < CANCELLED_CHILD_SETTLE_MS
    ) {
      continue
    }
    const failure = childRunFailure(child)
    // Refused when the child's own message, or another sweep, got there first.
    await unlessSuperseded(() =>
      failure
        ? api.setStepError(step.stepId, failure, step.attemptCount)
        : api.setStepResult(step.stepId, child.output, step.attemptCount)
    )
  }
}

/**
 * A `running` step with a child run is that child's to finish, whatever became
 * of the lease of the worker that started it.
 */
export const isParkedOnChild = ({
  status,
  childRunId,
}: Pick<StepState, 'status' | 'childRunId'>): boolean =>
  status === 'running' && childRunId != null
