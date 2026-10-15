import type { ListChangesInput, ListChangesOutput } from './types.js'

export type BoardStatus =
  'backlog' | 'ready' | 'in_progress' | 'needs_answer' | 'done' | 'dismissed'

export const COLUMNS = [
  'backlog',
  'ready',
  'in_progress',
  'needs_answer',
] as const

export const COLUMN_LABELS: Record<BoardStatus, string> = {
  backlog: 'backlog',
  ready: 'ready',
  in_progress: 'in progress',
  needs_answer: 'needs answer',
  done: 'done',
  dismissed: 'dismissed',
}

type HostedChange = ListChangesOutput['changes'][number]
export type BoardChange = Omit<HostedChange, 'status'> & {
  status: BoardStatus
}
export type BoardGroup = ListChangesOutput['groups'][number]
export type BoardList = { changes: BoardChange[]; groups: BoardGroup[] }

export const toBoardStatus = (status: string): string =>
  status === 'open' || status === 'claimed' ? 'ready' : status

/**
 * The hosted API knows open|claimed|needs_answer|in_progress|done|dismissed.
 * Everything the CLI reads from it is renamed on the way in, and every status
 * filter it sends is renamed on the way out.
 */
export function fromHosted<T>(value: T): T {
  if (Array.isArray(value)) return value.map(fromHosted) as T
  if (!value || typeof value !== 'object' || value instanceof Date) return value
  const out: Record<string, unknown> = {}
  for (const [key, entry] of Object.entries(value)) {
    out[key] =
      key === 'status' && typeof entry === 'string'
        ? toBoardStatus(entry)
        : fromHosted(entry)
  }
  return out as T
}

export function toHostedInput(data: unknown): unknown {
  const input = data as { status?: string[] } | null
  if (!input || !Array.isArray(input.status)) return data
  const status = input.status.flatMap((s) =>
    s === 'ready' ? ['open', 'claimed'] : [s]
  )
  return { ...input, status }
}

export const statuses = (...list: BoardStatus[]): ListChangesInput['status'] =>
  list as unknown as ListChangesInput['status']

export const board = (list: ListChangesOutput): BoardList =>
  list as unknown as BoardList

export const liveLease = (
  group: BoardGroup | undefined,
  now: number
): boolean =>
  !!group?.claimedBy &&
  !!group.claimExpiresAt &&
  new Date(group.claimExpiresAt).getTime() > now

export type Claim = { claimedBy: string; until: Date }

/** A change is claimed when its group holds a live lease; nothing is stored on the change. */
export function claimOf(
  change: Pick<BoardChange, 'groupId'>,
  groups: BoardGroup[],
  now: number
): Claim | null {
  const group = groups.find((g) => g.groupId === change.groupId)
  if (!group || !liveLease(group, now)) return null
  return {
    claimedBy: group.claimedBy!,
    until: new Date(group.claimExpiresAt!),
  }
}

export const isAbandoned = (
  change: BoardChange,
  groups: BoardGroup[],
  now: number
): boolean => change.status === 'in_progress' && !claimOf(change, groups, now)

export const pickableStatus = (status: BoardStatus): boolean =>
  status === 'ready' || status === 'in_progress'
