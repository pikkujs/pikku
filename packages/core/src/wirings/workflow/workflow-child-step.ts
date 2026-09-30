import { getSingletonServices } from '../../pikku-state.js'
import type { PikkuRPC } from '../rpc/rpc-types.js'
import { ChildWorkflowStartedException } from './graph/graph-runner.js'
import { childRunFailure } from './workflow-compensation.js'
import type { WorkflowRun, WorkflowRunWire } from './workflow.types.js'

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
  pikkuUserId: string | undefined
): Promise<unknown> => {
  const { runId: childRunId } = await api.startWorkflow(
    workflowName,
    data,
    { type: 'workflow', id: workflowName, parentRunId: runId, pikkuUserId },
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
  pikkuUserId: string | undefined
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
      pikkuUserId,
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
