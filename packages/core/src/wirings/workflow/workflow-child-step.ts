import { getSingletonServices } from '../../pikku-state.js'
import type { PikkuRPC } from '../rpc/rpc-types.js'
import { ChildWorkflowStartedException } from './graph/graph-runner.js'
import { childRunFailure } from './workflow-compensation.js'
import { WORKFLOW_TERMINAL_STATES } from './workflow-constants.js'
import { runningStepLease } from './workflow-step-lease.js'
import type {
  StepState,
  WorkflowRun,
  WorkflowRunWire,
} from './workflow.types.js'

interface ChildStepApi {
  startWorkflow(
    name: string,
    input: unknown,
    wire: WorkflowRunWire,
    rpcService: PikkuRPC,
    options?: { inline?: boolean }
  ): Promise<{ runId: string }>
  setStepChildRunId(stepId: string, childRunId: string): Promise<void>
}

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
  const { runId: childRunId } = await api.startWorkflow(
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
    { inline: true }
  )
  await api.setStepChildRunId(stepId, childRunId)
  const childRun = await api.awaitRunEnd(childRunId)
  const failure = childRunFailure(childRun)
  if (failure) throw failure
  return childRun.output
}

export const startQueuedChildStep = async (
  api: ChildStepApi & { getRun(id: string): Promise<WorkflowRun | null> },
  runId: string,
  stepId: string,
  workflowName: string,
  data: unknown,
  rpcService: PikkuRPC,
  parentWire: WorkflowRunWire | undefined
): Promise<unknown> => {
  const shouldInline = !getSingletonServices()?.queueService
  const { runId: childRunId } = await api.startWorkflow(
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
    { inline: shouldInline }
  )
  await api.setStepChildRunId(stepId, childRunId)
  if (!shouldInline) {
    throw new ChildWorkflowStartedException(runId, stepId, childRunId)
  }
  const childRun = await api.getRun(childRunId)
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
    if (failure) {
      await api.setStepError(step.stepId, failure, step.attemptCount)
    } else {
      await api.setStepResult(step.stepId, child.output, step.attemptCount)
    }
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
