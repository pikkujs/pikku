import type { z } from 'zod'
import { pikkuSessionlessFunc } from '#pikku/function'
import { changesContext } from '../../fabric/lib/changes.js'
import { claimable } from '../../fabric/lib/changes-next.js'
import { NextInput, NextOutput } from './next.schemas.js'

export const next = pikkuSessionlessFunc({
  description:
    'Decide what should run next in this project, and print the agent, the skill it starts with and the work it is given.',
  input: NextInput,
  output: NextOutput,
  func: async () => {
    const { rpc, projectId } = await changesContext(undefined)
    const list = await rpc.invoke('listChanges', {
      projectId: projectId!,
      status: ['open', 'claimed', 'in_progress'],
      includeDone: false,
      pickupOnly: false,
      limit: 200,
    })
    const now = Date.now()
    const running = list.groups.filter(
      (g) => g.claimExpiresAt && new Date(g.claimExpiresAt).getTime() > now
    )
    if (running.length)
      return {
        agent: null,
        skill: null,
        refs: [],
        reason: `A changeset is running: ${running.map((g) => g.title).join(', ')}`,
        context: null,
      }
    const ready = claimable(list, now)
    if (!ready.length)
      return {
        agent: null,
        skill: null,
        refs: [],
        reason: 'Nothing to do',
        context: null,
      }
    return {
      agent: 'changes' as const,
      skill: 'pikku-changes',
      refs: [],
      reason: `${ready.length} open change(s)`,
      context: [
        '# Open changes',
        '',
        ...ready.flatMap((c) => [
          `## #${c.shortId} ${c.title}`,
          ...(c.body ? ['', c.body] : []),
          '',
        ]),
      ].join('\n'),
    }
  },
})

export const renderNext = (
  _s: unknown,
  result: z.infer<typeof NextOutput>
): void => {
  if (!result.agent) {
    console.log(result.reason)
    return
  }
  console.log(`${result.agent} agent, skill ${result.skill} — ${result.reason}`)
  console.log(result.context)
}
