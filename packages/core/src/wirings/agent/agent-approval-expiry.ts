import { GoneError } from '../../errors/errors.js'
import {
  isApprovalExpired,
  type AgentRunStateService,
} from '../../services/agent-run-state-service.js'
import type { CoreAgent, PendingApproval } from './agent.types.js'

export { isApprovalExpired }

/** How long a suspended run waits for its approval when the agent sets no `approvalTtlMs`: 10 minutes. */
export const DEFAULT_AGENT_APPROVAL_TTL_MS = 10 * 60 * 1000

/** The `errorMessage` a run is failed with when it is resumed after its approval expired. */
export const APPROVAL_EXPIRED_MESSAGE = 'approval expired'

/**
 * @throws Error when `approvalTtlMs` is set to anything but a finite number above zero.
 */
export const assertValidApprovalTtl = (
  agentName: string,
  approvalTtlMs: unknown
): void => {
  if (approvalTtlMs === undefined) return
  if (
    typeof approvalTtlMs !== 'number' ||
    !Number.isFinite(approvalTtlMs) ||
    approvalTtlMs <= 0
  ) {
    const given =
      typeof approvalTtlMs === 'number'
        ? String(approvalTtlMs)
        : `a ${typeof approvalTtlMs}`
    throw new Error(
      `AI agent '${agentName}' has approvalTtlMs ${given}: it must be a finite number of milliseconds above zero`
    )
  }
}

export const approvalExpiresAt = (
  agent: Pick<CoreAgent, 'approvalTtlMs'>,
  now: number = Date.now()
): Date =>
  new Date(now + (agent.approvalTtlMs ?? DEFAULT_AGENT_APPROVAL_TTL_MS))

/** Fails a run whose approval expired, and clears what it was waiting on. */
export const expireRun = (
  agentRunState: AgentRunStateService,
  runId: string
): Promise<void> =>
  agentRunState.updateRun(runId, {
    status: 'failed',
    errorMessage: APPROVAL_EXPIRED_MESSAGE,
    pendingApprovals: [],
  })

/**
 * Refuses a resume when any of the approvals it answers has expired, failing the
 * run first so it does not sit `suspended` on approvals nobody can claim.
 *
 * @throws GoneError naming the run, the tool call and when it expired.
 */
export const refuseExpiredApprovals = async (
  agentRunState: AgentRunStateService,
  runId: string,
  approvals: PendingApproval[],
  now: number = Date.now()
): Promise<void> => {
  const expired = approvals.find((a) => isApprovalExpired(a, now))
  if (!expired) return
  await expireRun(agentRunState, runId)
  const when =
    expired.expiresAt == null
      ? 'it has no expiry recorded'
      : `it expired at ${new Date(expired.expiresAt).toISOString()}`
  throw new GoneError(
    `Approval for toolCallId ${expired.toolCallId} on run ${runId} can no longer be resumed: ${when}`
  )
}
