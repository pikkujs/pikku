import { hasScopes } from '@pikku/core/ecosystem/scope'
import { threadOwnerConstraint } from '@pikku/core/ecosystem/agent'
import { pikkuFunc } from '#pikku/function'

const ADMIN_SCOPE_ROOT = 'admin'

export const getAgentThreads = pikkuFunc<
  { agentName?: string; resourceId?: string; limit?: number; offset?: number },
  any[]
>({
  title: 'Get Agent Threads',
  description:
    'Returns a list of AI agent threads from the database. Accepts optional filters: agentName, resourceId, limit, and offset for pagination. A caller without the admin scope sees only the threads its own session owns.',
  expose: true,
  scopes: ['pikku:console:agents:read'],
  func: async ({ agentRunService }, input, { session }) => {
    const owners = hasScopes([ADMIN_SCOPE_ROOT], session?.scopes)
      ? undefined
      : threadOwnerConstraint(session)
    return await agentRunService.listThreads({
      agentName: input?.agentName,
      resourceId: input?.resourceId,
      owners,
      limit: input?.limit,
      offset: input?.offset,
    })
  },
})
