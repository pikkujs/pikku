import { hasScopes } from '@pikku/core/scope'
import { canAccessThread } from '@pikku/core/agent'
import { pikkuFunc } from '#pikku/function'

const ADMIN_SCOPE_ROOT = 'admin'

export const getAgentThreadRuns = pikkuFunc<{ threadId: string }, any[]>({
  title: 'Get Agent Thread Runs',
  description:
    'Returns all runs for a given AI agent thread, ordered by creation time descending. A caller without the admin scope sees only the runs its own session owns.',
  expose: true,
  scopes: ['pikku:console:agents:read'],
  func: async ({ agentRunService }, input, { session }) => {
    const runs = await agentRunService.getThreadRuns(input.threadId)
    if (hasScopes([ADMIN_SCOPE_ROOT], session?.scopes)) {
      return runs
    }
    // A run names the model, the tools it reached for and why it failed, so it
    // is read under the same ownership as the thread it belongs to. Filtered
    // rather than refused: an empty list is what a thread with no runs returns
    // too, so the answer never confirms that someone else's thread exists.
    return runs.filter((run) => canAccessThread(run.resourceId, session))
  },
})
