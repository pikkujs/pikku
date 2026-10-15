import { z } from 'zod'
import { pikkuSessionlessFunc } from '#pikku/addon/function'
import { changesContext, idList } from '../lib/changes.js'
import { PreconditionError, dim, safe } from '@pikku/cli/addon-support'
import type { ChangesRPC } from '../lib/changes-local.js'

export const ChangesBacklogInput = z.object({
  apiUrl: z.string().optional(),
  changeIds: z.array(z.string()).optional(),
})

export const ChangesBacklogOutput = z.object({
  changes: z.any(),
})

type Shelved = { shortId: string; title: string; backlog?: boolean }

async function toggle(
  input: z.infer<typeof ChangesBacklogInput>,
  backlog: boolean
): Promise<{ changes: Shelved[] }> {
  const refs = idList(input.changeIds)
  if (!refs)
    throw new PreconditionError(
      `Name the changes to ${backlog ? 'put in' : 'take out of'} the backlog, e.g. \`pikku changes ${backlog ? 'backlog' : 'unbacklog'} 3 4\`.`
    )
  const { rpc } = await changesContext(input.apiUrl)
  const update = (rpc as ChangesRPC).invoke as unknown as (
    name: string,
    data: unknown
  ) => Promise<{ change: Shelved }>
  const changes: Shelved[] = []
  for (const ref of refs)
    changes.push((await update('updateChange', { changeId: ref, backlog })).change)
  return { changes }
}

export const ChangesBacklog = pikkuSessionlessFunc({
  description: 'Put changes in the backlog: tracked, but never picked up.',
  input: ChangesBacklogInput,
  output: ChangesBacklogOutput,
  func: async (_services, input) => toggle(input, true),
})

export const ChangesUnbacklog = pikkuSessionlessFunc({
  description: 'Take changes out of the backlog so they can be picked up.',
  input: ChangesBacklogInput,
  output: ChangesBacklogOutput,
  func: async (_services, input) => toggle(input, false),
})

const renderToggle =
  (verb: string) =>
  (_s: unknown, { changes }: { changes: Shelved[] }): void => {
    for (const change of changes)
      console.log(`#${safe(change.shortId)} ${verb}  ${dim(safe(change.title))}`)
  }

export const renderChangesBacklog = renderToggle('in the backlog')
export const renderChangesUnbacklog = renderToggle('out of the backlog')
