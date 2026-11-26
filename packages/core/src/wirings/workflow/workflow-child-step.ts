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
  for (const { stepName, status, childRunId } of await api.getRunSteps(runId)) {
    if (status !== 'running' || !childRunId) continue
    const child = await api.getRun(childRunId)
    if (!child || !WORKFLOW_TERMINAL_STATES.has(child.status)) continue
    const step = await api.getStepState(runId, stepName)
    if (step.status !== 'running' || runningStepLease(step) === 'held') {
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
 * A `running` step with a child run and no lease: what a worker leaves to its
 * child. In an inline run, which has no worker, it is a pass that died waiting.
 */
export const isParkedOnChild = ({
  status,
  childRunId,
  leaseExpiresAt,
}: StepState): boolean =>
  status === 'running' && childRunId != null && leaseExpiresAt == null
