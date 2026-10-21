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
import { filterChanges } from '../lib/changes-filter.js'
import { SPECIALISTS } from '../lib/specialists.js'

const STATUSES = [
  'backlog',
  'ready',
  'in_progress',
  'needs_answer',
  'done',
  'dismissed',
] as const

const FETCH_ALL = 5000

export const ChangesListInput = z.object({
  apiUrl: z.string().optional(),
  projectId: z.string().optional(),
  stageId: z.string().optional(),
  route: z.string().optional(),
  groupId: z.string().optional(),
  pickupOnly: z.boolean().optional(),
  includeDone: z.boolean().optional(),
  limit: z.number().optional(),
  status: z
    .array(z.enum(STATUSES))
    .optional()
    .describe(
      'Only these columns: backlog, ready, in_progress, needs_answer, done, dismissed — repeatable'
    ),
  specialist: z
    .enum(SPECIALISTS)
    .optional()
    .describe('Only changes the given specialist builds'),
  search: z
    .string()
    .optional()
    .describe('Only changes whose title or body contains this text'),
  all: z
    .boolean()
    .optional()
    .describe('Show every change in each column instead of the first 50'),
})

export const ChangesListOutput = z.object({
  changes: z.any(),
  groups: z.any(),
  totals: z.record(z.string(), z.number()).optional(),
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
    const wanted = input.status ? new Set<string>(input.status) : null
    const closed = !!wanted && (wanted.has('done') || wanted.has('dismissed'))
    const listed = await rpc.invoke('listChanges', {
      projectId: requireProjectId(projectId),
      stageId: input.stageId,
      route: input.route,
      groupId: input.groupId,
      pickupOnly: input.pickupOnly ?? false,
      includeDone: (input.includeDone ?? false) || closed,
      limit: FETCH_ALL,
    })
    const { shown, totals } = filterChanges(listed.changes as BoardChange[], {
      status: input.status,
      specialist: input.specialist,
      search: input.search,
      cap: input.all ? Infinity : (input.limit ?? 50),
    })
    const groupIds = new Set(shown.map((change) => change.groupId))
    return {
      changes: shown,
      groups: (listed.groups as BoardGroup[]).filter((group) =>
        groupIds.has(group.groupId)
      ),
      totals,
    }
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

const line =
  (groups: Group[], now: number) =>
  (change: BoardChange): void => {
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
      .map(
        (element) => element.testId ?? element.sourceAnchor ?? element.cssPath
      )
      .filter((name): name is string => !!name)
      .map(safe)
    if (named.length) console.log(dim(`      circled: ${named.join(', ')}`))
  }

export const renderChangesList = (
  _s: unknown,
  {
    changes,
    groups,
    totals,
  }: {
    changes: BoardChange[]
    groups: Group[]
    totals?: Record<string, number>
  }
): void => {
  if (!changes.length) {
    console.log(dim('  Nothing open.'))
    return
  }
  const now = Date.now()
  const columns: BoardStatus[] = [
    ...COLUMNS,
    ...(['done', 'dismissed'] as const).filter((status) =>
      changes.some((c) => c.status === status)
    ),
  ]
  columns.forEach((status, index) => {
    const cards = changes.filter((change) => change.status === status)
    const total = totals?.[status] ?? cards.length
    if (index) console.log('')
    console.log(
      `${COLUMN_LABELS[status]} (${total})${
        total > cards.length ? dim(` — showing ${cards.length}, --all for the rest`) : ''
      }`
    )
    cards.forEach(line(groups, now))
  })
}
