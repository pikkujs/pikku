import { hasScopes } from '@pikku/core/scope'
import { canAccessThread } from '@pikku/core/agent'
import { pikkuPermission } from '#pikku/addon/auth'

const ADMIN_SCOPE_ROOT = 'admin'

/**
 * A single-thread read is keyed by a caller-supplied `threadId`, so ownership
 * cannot come from the request — it is derived from the session and checked
 * against the stored thread's resourceId. The sibling list endpoints filter
 * instead; a lookup of one thread has nothing to filter, so it is refused.
 *
 * A missing thread is refused rather than 404'd so it is indistinguishable from
 * one owned by someone else — no existence oracle.
 */
export const isThreadOwner = pikkuPermission<{ threadId: string }>(
  async ({ agentRunService }, { threadId }, { session }) => {
    if (hasScopes([ADMIN_SCOPE_ROOT], session?.scopes)) {
      return true
    }
    const thread = await agentRunService.getThread(threadId)
    if (!thread) return false
    return canAccessThread(thread.resourceId, session)
  }
)
