import { toBoardStatus, type BoardChange, type BoardStatus } from './changes-board.js'

export type ChangesFilter = {
  status?: BoardStatus[]
  specialist?: string
  search?: string
  cap: number
}

export const filterChanges = (
  changes: BoardChange[],
  filter: ChangesFilter
): { shown: BoardChange[]; totals: Record<string, number> } => {
  const wanted = filter.status?.length ? new Set<string>(filter.status) : null
  const needle = filter.search?.trim().toLowerCase()
  const totals: Record<string, number> = {}
  const seen: Record<string, number> = {}
  const shown = changes.filter((change) => {
    const status = toBoardStatus(change.status)
    if (wanted && !wanted.has(status)) return false
    if (filter.specialist && change.specialist !== filter.specialist)
      return false
    if (needle) {
      const body = (change as { body?: string }).body ?? ''
      if (!`${change.title}\n${body}`.toLowerCase().includes(needle))
        return false
    }
    totals[status] = (totals[status] ?? 0) + 1
    seen[status] = (seen[status] ?? 0) + 1
    return seen[status] <= filter.cap
  })
  return { shown, totals }
}
