import type { Logger } from '../../services/logger.js'
import type { PikkuWorkflowService } from './pikku-workflow-service.js'
import type { ApprovalStore } from './workflow-approval.js'
import { auditApprovalDecision } from './workflow-approval-audit.js'

/** What the approval and suspend gates need from the workflow service. */
export const createApprovalStore = (
  service: PikkuWorkflowService,
  deps: {
    logger(): Logger | undefined
    /** Ask for the run to be looked at again after `delay`, through the queue. */
    enqueueWake(
      runId: string,
      workflowName: string,
      delay: number
    ): Promise<void>
  }
): ApprovalStore => ({
  getStepState: (...args) => service.getStepState(...args),
  insertStepState: (...args) => service.insertStepState(...args),
  setStepRunning: (...args) => service.setStepRunning(...args),
  setStepResult: (...args) => service.setStepResult(...args),
  getRunState: (...args) => service.getRunState(...args),
  updateRunState: (...args) => service.updateRunState(...args),
  resumeWorkflow: (runId) => service.resumeWorkflow(runId),
  scheduleRunWake: async (runId, delay) => {
    try {
      const run = await service.getRun(runId)
      if (!run?.workflow) return
      await deps.enqueueWake(runId, run.workflow, delay)
    } catch (error) {
      deps
        .logger()
        ?.warn(
          `Failed to schedule approval expiry wake for run ${runId}; expiry will still resolve on the next replay`,
          error
        )
    }
  },
  getRunOwner: async (runId) =>
    (await service.getRunIdentity(runId))?.wire?.pikkuUserId,
  auditApproval: (event) => auditApprovalDecision(event),
})
