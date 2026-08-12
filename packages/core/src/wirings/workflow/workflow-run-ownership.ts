import { ForbiddenError } from '../../errors/errors.js'
import { addError } from '../../errors/error-handler.js'
import type { CoreUserSession } from '../../types/core.types.js'
import type { WorkflowRunWire } from './workflow.types.js'

export class WorkflowRunForbiddenError extends ForbiddenError {
  constructor() {
    super('Not authorized to access this workflow run')
  }
}
addError(WorkflowRunForbiddenError, {
  status: 403,
  message: 'Not authorized to access this workflow run.',
})

/**
 * A run started through a session records that session's user as its owner, and
 * only that user may read it. Who may *answer* a run's approval gates is the
 * gate's own declaration — see `approvers` on `workflow.approval()`.
 *
 * A run with no recorded owner — started by a trigger, a scheduler, or a route
 * wired without auth — has nobody to compare a caller against, so ownership is
 * not a control that exists for it. Gate those with `auth` or `permissions` on
 * the entrypoint instead.
 */
export const assertWorkflowRunOwner = (
  wire: WorkflowRunWire | undefined,
  session: CoreUserSession | undefined
): void => {
  const owner = wire?.pikkuUserId
  if (!owner) {
    return
  }
  if (!session?.userId || session.userId !== owner) {
    throw new WorkflowRunForbiddenError()
  }
}
