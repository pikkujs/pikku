import { z } from 'zod'
import { pikkuSessionlessFunc } from '#pikku/addon/function'
import {
  age,
  changesContext,
  clockTime,
  requireProjectId,
} from '../lib/changes.js'
import { dim, safe, statusColor } from '@pikku/cli/addon-support'
import {
  COLUMNS,
  COLUMN_LABELS,
  claimOf,
  isAbandoned,
  type BoardChange,
  type BoardGroup,
  type BoardStatus,
} from '../lib/changes-board.js'

export const ChangesListInput = z.object({
  apiUrl: z.string().optional(),
  projectId: z.string().optional(),
  stageId: z.string().optional(),
  route: z.string().optional(),
  groupId: z.string().optional(),
  pickupOnly: z.boolean().optional(),
  includeDone: z.boolean().optional(),
  limit: z.number().optional(),
})

export const ChangesListOutput = z.object({
  changes: z.any(),
  groups: z.any(),
})

export const ChangesList = pikkuSessionlessFunc({
  description: 'List the open changes filed against a project.',
  input: ChangesListInput,
  output: ChangesListOutput,
  func: async (_services, input) => {
    const { rpc, projectId } = await changesContext(
      input.apiUrl,
      input.projectId
    )
    return await rpc.invoke('listChanges', {
      projectId: requireProjectId(projectId),
      stageId: input.stageId,
      route: input.route,
      groupId: input.groupId,
      pickupOnly: input.pickupOnly ?? false,
      includeDone: input.includeDone ?? false,
      limit: input.limit ?? 50,
    })
  },
})

type Group = BoardGroup

const badge = (
  change: BoardChange,
  groups: Group[],
  now: number
): string | null => {
  const asked = (change as { ask?: { kind: string } }).ask
  if (change.status === 'needs_answer' && asked)
    return `needs answer · ${safe(asked.kind)}`
  const claim = claimOf(change, groups, now)
  if (claim)
    return `claimed by ${safe(claim.claimedBy)} until ${clockTime(claim.until)}`
  return isAbandoned(change, groups, now) ? 'abandoned' : null
}

const line = (groups: Group[], now: number) => (change: BoardChange): void => {
  const flags = [
    badge(change, groups, now),
    change.heldUntil
      ? dim(`claimable at ${clockTime(change.heldUntil)}`)
      : change.held
        ? dim('held')
        : null,
    change.route ? safe(change.route) : null,
  ]
    .filter(Boolean)
    .join('  ')
  console.log(`  #${safe(change.shortId)}  ${safe(change.title)}`)
  console.log(
    `      ${flags ? `${flags}  ` : ''}${age(change.createdAt)} ago  ${dim(safe(change.changeId))}`
  )
  const named = (change.capture?.elements ?? [])
    .map((element) => element.testId ?? element.sourceAnchor ?? element.cssPath)
    .filter((name): name is string => !!name)
    .map(safe)
  if (named.length) console.log(dim(`      circled: ${named.join(', ')}`))
}

export const renderChangesList = (
  _s: unknown,
  { changes, groups }: { changes: BoardChange[]; groups: Group[] }
): void => {
  if (!changes.length) {
    console.log(dim('  Nothing open.'))
    return
  }
  const now = Date.now()
  const columns: BoardStatus[] = changes.some((c) => c.status === 'done')
    ? [...COLUMNS, 'done']
    : [...COLUMNS]
  columns.forEach((status, index) => {
    const cards = changes.filter((change) => change.status === status)
    if (index) console.log('')
    console.log(`${COLUMN_LABELS[status]} (${cards.length})`)
    cards.forEach(line(groups, now))
  })
}
