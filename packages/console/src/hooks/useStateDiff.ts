import { useQuery } from '@tanstack/react-query'
import { usePikkuRPC } from '../context/PikkuRpcProvider'

export interface DiffEntry {
  id: string
  status: 'added' | 'removed' | 'modified' | 'unchanged'
  ours?: Record<string, unknown>
  base?: Record<string, unknown>
}

export interface CategoryDiff {
  added: number
  removed: number
  modified: number
  unchanged: number
  entries: DiffEntry[]
}

export interface StateDiff {
  oursPath: string
  basePath: string
  oursExists: boolean
  baseExists: boolean
  categories: Record<string, CategoryDiff>
  summary: Record<string, { added: number; removed: number; modified: number }>
}

export function useStateDiff(
  basePath: string | null,
  oursPath?: string | null
) {
  const rpc = usePikkuRPC()
  return useQuery({
    queryKey: ['state-diff', basePath, oursPath],
    queryFn: async () => {
      if (!basePath) return null
      const input: { basePath: string; oursPath?: string } = { basePath }
      if (oursPath) input.oursPath = oursPath
      return (await rpc.invoke('console:getStateDiff', input)) as StateDiff
    },
    enabled: !!basePath,
    staleTime: 5_000,
  })
}
