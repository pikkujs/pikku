import { z } from 'zod'
import { pikkuSessionlessFunc } from '#pikku/addon/function'
import { changesContext, idList } from '../lib/changes.js'
import { CloudPreconditionError, dim, safe } from '@pikku/cli/addon-support'
import { LOCAL_PROJECT_ID, type Move } from '../lib/changes-local.js'

export const ChangesMoveInput = z.object({
  apiUrl: z.string().optional(),
  changeIds: z.array(z.string()).optional(),
})

export const ChangesMoveOutput = z.object({
  changes: z.any(),
})

type Moved = { shortId: string; title: string; status: string }
type Invoke = (name: string, data: unknown) => Promise<{ change: Moved }>

async function move(
  input: z.infer<typeof ChangesMoveInput>,
  to: Move,
  verb: string
): Promise<{ changes: Moved[] }> {
  const refs = idList(input.changeIds)
  if (!refs)
    throw new CloudPreconditionError(
      `Name the changes to ${verb}, e.g. \`pikku changes ${verb} 3 4\`.`
    )
  const { rpc, projectId } = await changesContext(input.apiUrl)
  const local = projectId === LOCAL_PROJECT_ID
  if (!local && to !== 'in_progress')
    throw new CloudPreconditionError(
      'The backlog is kept in the local changes queue; this project keeps its changes in Pikku Studio Cloud.'
    )
  const invoke = rpc.invoke as unknown as Invoke
  const changes: Moved[] = []
  for (const ref of refs) {
    const { change } = local
      ? await invoke('moveChange', { changeId: ref, to })
      : await invoke('updateChange', { changeId: ref, status: 'in_progress' })
    changes.push(change)
  }
  return { changes }
}

export const ChangesStart = pikkuSessionlessFunc({
  description: 'Mark changes in progress: the work has begun.',
  input: ChangesMoveInput,
  output: ChangesMoveOutput,
  func: async (_services, input) => move(input, 'in_progress', 'start'),
})

export const ChangesBacklog = pikkuSessionlessFunc({
  description: 'Put changes in the backlog: tracked, but never picked up.',
  input: ChangesMoveInput,
  output: ChangesMoveOutput,
  func: async (_services, input) => move(input, 'backlog', 'backlog'),
})

export const ChangesReady = pikkuSessionlessFunc({
  description: 'Move backlog changes to ready so they can be picked up.',
  input: ChangesMoveInput,
  output: ChangesMoveOutput,
  func: async (_services, input) => move(input, 'ready', 'ready'),
})

const printMoved = (changes: Moved[], words: string): void => {
  for (const change of changes)
    console.log(`#${safe(change.shortId)} ${words}  ${dim(safe(change.title))}`)
}

export const renderChangesStart = (
  _s: unknown,
  { changes }: { changes: Moved[] }
): void => printMoved(changes, 'in progress')

export const renderChangesBacklog = (
  _s: unknown,
  { changes }: { changes: Moved[] }
): void => printMoved(changes, 'in the backlog')

export const renderChangesReady = (
  _s: unknown,
  { changes }: { changes: Moved[] }
): void => printMoved(changes, 'ready')
