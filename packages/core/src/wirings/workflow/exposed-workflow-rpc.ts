import { MissingServiceError } from '../../errors/errors.js'
import type { CoreServices, PikkuRawWire } from '../../types/core.types.js'
import type { PikkuRPC } from '../rpc/rpc-types.js'
import {
  assertWorkflowExposed,
  callerSession,
  checkWorkflowRunAccess,
} from './workflow-run-access.js'
import type { WorkflowRunWire } from './workflow.types.js'
import { streamWorkflowRunStatus } from './workflow-status-stream.js'

/**
 * `wire.rpc.exposedWorkflow`, implemented: the calls behind the generated
 * `/workflow/:workflowName/*` routes, and the external counterpart of
 * `rpc.startWorkflow`.
 *
 * Every call first requires the workflow to be `expose: true` and answers 404
 * otherwise. That is the generated surface's access policy and nothing more: a
 * start records who started the run and hands over, and the workflow judges its
 * own `auth`, scopes, permissions and input when its function runs. Reading and
 * answering a run check the run's owner and the gate's approvers.
 * `rpc.startWorkflow` stays unchecked for `expose`: it is application code.
 */
export const createExposedWorkflowRPC = (
  services: CoreServices,
  wire: PikkuRawWire,
  rpc: PikkuRPC
): PikkuRPC['exposedWorkflow'] => {
  const workflowService = () => {
    if (!services.workflowService) {
      throw new MissingServiceError('workflowService is required')
    }
    return services.workflowService
  }
  const workflowRunService = () => {
    if (!services.workflowRunService) {
      throw new MissingServiceError('workflowRunService is required')
    }
    return services.workflowRunService
  }

  /** Who started the run. The workflow's own checks run when its function does. */
  const runWire = async (): Promise<WorkflowRunWire> => {
    const pikkuUserId = wire.pikkuUserId ?? (await callerSession(wire))?.userId
    return {
      type: wire.wireType ?? 'unknown',
      id: wire.wireId,
      ...(pikkuUserId ? { pikkuUserId } : {}),
    }
  }

  const streamStatus = async (
    workflowName: string,
    runId: string,
    detailed: boolean
  ) => {
    assertWorkflowExposed(workflowName)
    const service = workflowRunService()
    if (!wire.channel) return
    await streamWorkflowRunStatus({
      workflowRunService: service,
      workflowName,
      runId,
      channel: wire.channel,
      wire,
      ...(detailed ? { detailed } : {}),
    })
  }

  return {
    start: async (workflowName, data) => {
      assertWorkflowExposed(workflowName)
      workflowService()
      return await rpc.startWorkflow(workflowName, data ?? {}, {
        wire: await runWire(),
      })
    },
    run: async (workflowName, data) => {
      assertWorkflowExposed(workflowName)
      const service = workflowService()
      return await service.runToCompletion(workflowName, data ?? {}, rpc, {
        wire: await runWire(),
      })
    },
    status: async (workflowName, runId) => {
      assertWorkflowExposed(workflowName)
      const service = workflowService()
      const run = await service.getRun(runId)
      await checkWorkflowRunAccess(workflowName, run, wire, 'read')
      const status = await service.getRunStatus(runId)
      if (!status) throw new Error(`Run not found: ${runId}`)
      return status
    },
    approve: async (workflowName, runId, reason, decision) => {
      assertWorkflowExposed(workflowName)
      const service = workflowService()
      const run = await service.getRun(runId)
      await checkWorkflowRunAccess(workflowName, run, wire, 'approve')
      const session =
        typeof wire.getSession === 'function'
          ? await wire.getSession()
          : wire.session
      await service.approveStep(runId, reason, decision, session)
      return { ok: true as const }
    },
    streamStatus: (workflowName, runId) =>
      streamStatus(workflowName, runId, false),
    streamStatusFull: (workflowName, runId) =>
      streamStatus(workflowName, runId, true),
  }
}
