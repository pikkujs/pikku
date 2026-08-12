import { ForbiddenError } from '../../errors/errors.js'
import { addError } from '../../errors/error-handler.js'
import type { CoreUserSession } from '../../types/core.types.js'
import type { WorkflowApprovalPolicy } from './workflow.types.js'

export class WorkflowApprovalForbiddenError extends ForbiddenError {
  public payload: { reason: string; detail: string }
  constructor(reason: string, detail: string) {
    super(detail)
    this.payload = { reason, detail }
  }
}
addError(WorkflowApprovalForbiddenError, {
  status: 403,
  message: 'Not authorized to answer this approval.',
})

/**
 * The decider, reduced to the two facts a policy can be expressed in terms of.
 * Recorded alongside the decision so the gate can be judged on replay — the
 * session itself is long gone by then.
 */
export interface ApprovalDecider {
  userId?: string
  scopes?: string[]
}

export const approvalDeciderFrom = (
  session: CoreUserSession | undefined
): ApprovalDecider | undefined =>
  session ? { userId: session.userId, scopes: session.scopes } : undefined

/**
 * Judge a decision against the gate's declared policy, returning the reason it
 * is refused or `undefined` if it stands.
 *
 * Returns a message rather than throwing because the same judgement is needed
 * in two places with different outcomes: refusing a live submission with a 403,
 * and clearing an already-recorded decision on replay.
 */
export const approvalPolicyRefusal = (
  policy: WorkflowApprovalPolicy,
  owner: string | undefined,
  decider: ApprovalDecider | undefined
): string | undefined => {
  if (
    policy.approverScope &&
    !decider?.scopes?.includes(policy.approverScope)
  ) {
    return `Answering this approval requires the '${policy.approverScope}' scope`
  }

  switch (policy.approvers ?? 'any') {
    case 'owner':
      if (!owner) {
        return undefined
      }
      if (!decider?.userId || decider.userId !== owner) {
        return 'Only the user who started this run may answer this approval'
      }
      return undefined

    case 'not-initiator':
      if (!decider?.userId) {
        return 'Answering this approval requires a signed-in user'
      }
      if (owner && decider.userId === owner) {
        return 'The user who started this run may not answer this approval'
      }
      return undefined

    case 'any':
      return undefined
  }
}
