import { NotFoundError } from '@pikku/core/ecosystem/errors'
import { hasScopes } from '@pikku/core/ecosystem/scope'
import { canAccessThread } from '@pikku/core/ecosystem/agent'
import { pikkuFunc } from '#pikku/function'

const ADMIN_SCOPE_ROOT = 'admin'

export const getAgentRunScores = pikkuFunc<{ runId: string }, any[]>({
  title: 'Get Agent Run Scores',
  description:
    'Returns every grade recorded against one AI agent run, newest first. A run accumulates one row per scorer, and a re-grade appends rather than replaces — so a run may carry the same scorer more than once. A caller without the admin scope may only read the grades of runs its own session owns.',
  expose: true,
  func: async ({ agentRunState }, input, { session }) => {
    const run = await agentRunState.getRun(input.runId)

    // A grade quotes the run it graded — a judge's reason is written about the
    // prompt and the answer — so reading one is reading the run. The same gate
    // the thread it belongs to would apply, applied here, and a run the caller
    // may not see is reported as absent rather than as forbidden: otherwise the
    // refusal itself confirms the id exists.
    if (
      !run ||
      (!hasScopes([ADMIN_SCOPE_ROOT], session?.scopes) &&
        !canAccessThread(run.resourceId, session))
    ) {
      throw new NotFoundError(`No agent run '${input.runId}'`)
    }

    return await agentRunState.getScores(input.runId)
  },
})
