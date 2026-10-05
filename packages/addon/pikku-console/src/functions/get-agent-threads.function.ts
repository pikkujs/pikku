import { hasScopes } from '@pikku/core/scope'
import { threadOwnerConstraint } from '@pikku/core/agent'
import { pikkuFunc } from '#pikku/addon/function'
import { addonNames, pageOf } from '../lib/addon-scope.js'
import type { AddonFilter } from '../lib/addon-scope.js'

const ADMIN_SCOPE_ROOT = 'admin'

export const getAgentThreads = pikkuFunc<
  {
    agentName?: string
    resourceId?: string
    limit?: number
    offset?: number
  } & AddonFilter,
  any[]
>({
  title: 'Get Agent Threads',
  description:
    "Returns a list of AI agent threads from the database. Accepts optional filters: agentName, resourceId, limit, and offset for pagination. With `addon`, only threads of that add-on's agents. A caller without the admin scope sees only the threads its own session owns.",
  expose: true,
  scopes: ['pikku:console:agents:read'],
  func: async ({ agentRunService }, input, { session }) => {
    const owners = hasScopes([ADMIN_SCOPE_ROOT], session?.scopes)
      ? undefined
      : threadOwnerConstraint(session)
    if (!input?.addon) {
      return await agentRunService.listThreads({
        agentName: input?.agentName,
        resourceId: input?.resourceId,
        owners,
        limit: input?.limit,
        offset: input?.offset,
      })
    }
    const names = addonNames(
      await agentRunService.getDistinctAgentNames(),
      input.addon
    ).filter((name) => !input.agentName || name === input.agentName)
    const threads = (
      await Promise.all(
        names.map((agentName) =>
          agentRunService.listThreads({
            agentName,
            resourceId: input.resourceId,
            owners,
          })
        )
      )
    ).flat()
    threads.sort((a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt))
    return pageOf(threads, input)
  },
})
