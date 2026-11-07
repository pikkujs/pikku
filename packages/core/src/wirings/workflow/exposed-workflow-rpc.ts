import { MissingServiceError } from '../../errors/errors.js'
import type { CoreServices, PikkuRawWire } from '../../types/core.types.js'
import type { PikkuRPC } from '../rpc/rpc-types.js'
import {
  assertWorkflowExposed,
  checkWorkflowRunAccess,
  checkWorkflowStart,
} from './workflow-run-access.js'
import { streamWorkflowRunStatus } from './workflow-status-stream.js'

/**
 * `wire.rpc.exposedWorkflow`, implemented: the calls behind the generated
 * `/workflow/:workflowName/*` routes, and the external counterpart of
 * `rpc.startWorkflow`.
 *
 * Every call first requires the workflow to be `expose: true` and answers 404
 * otherwise, then runs the workflow's own declaration (`auth`, scopes, input
 * schema, permissions, run ownership). The routes that call it hold no access
 * logic. `rpc.startWorkflow` stays unchecked for `expose`: it is application code.
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
      const start = await checkWorkflowStart(workflowName, data ?? {}, wire)
      return await rpc.startWorkflow(workflowName, start.input, {
        wire: start.wire,
      })
    },
    run: async (workflowName, data) => {
      assertWorkflowExposed(workflowName)
      const service = workflowService()
      const start = await checkWorkflowStart(workflowName, data ?? {}, wire)
      return await service.runToCompletion(workflowName, start.input, rpc, {
        wire: start.wire,
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
