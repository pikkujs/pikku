import { getSingletonServices } from '../../pikku-state.js'
import type { ApprovalAuditEvent } from './workflow-approval.js'

/** The audit type an answer to an approval gate is recorded under. */
export const APPROVAL_AUDIT_TYPE = 'workflow.approval.decided'

/**
 * Record an answer to an approval gate where it outlives the run.
 *
 * The step result carries the settled decision, but it is deleted with the run
 * — `deleteRun` cascades to steps and to history — and a refused attempt never
 * reaches a step at all. An approval is asked for precisely so it can be
 * answered for afterwards, so the answer also goes to the audit sink, which
 * holds no foreign key to the run.
 *
 * A project with no sink wired records nothing, and a sink that fails is logged
 * rather than thrown: the trail must not be the reason a decision is lost.
 */
export const auditApprovalDecision = async (
  event: ApprovalAuditEvent
): Promise<void> => {
  const services = getSingletonServices()
  if (!services?.audit) {
    return
  }
  try {
    await services.audit.audit({
      type: APPROVAL_AUDIT_TYPE,
      source: 'explicit',
      outcome: event.outcome,
      occurredAt: new Date().toISOString(),
      wireType: 'workflow',
      userIdentity: { pikkuUserId: event.decidedBy?.userId },
      metadata: {
        runId: event.runId,
        reason: event.reason,
        scopes: event.decidedBy?.scopes,
        refusal: event.refusal,
      },
    })
  } catch (error) {
    services.logger?.warn(
      `Failed to audit the decision on approval '${event.reason}' for run ${event.runId}`,
      error
    )
  }
}
