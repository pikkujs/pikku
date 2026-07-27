import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { usePikkuRPC } from '../context/PikkuRpcProvider'
import { toEnglishName } from '../lib/strings'

export function isPikkuFunction(func: any): boolean {
  return Array.isArray(func.tags) && func.tags.includes('pikku')
}

/**
 * Every function in the project, unfiltered. Shared by the functions page and
 * any host mounting a functions panel of its own — both read the same query
 * key, so mounting both costs one fetch.
 */
export const useFunctionsMeta = () => {
  const rpc = usePikkuRPC()
  return useQuery({
    queryKey: ['functions-meta'],
    queryFn: () => rpc.invoke('console:getFunctionsMeta'),
  })
}

/**
 * Narrows the function list by free-text search, and by whether Pikku's own
 * internal functions are wanted.
 */
export const useFilteredFunctions = (
  rawFunctions: unknown,
  searchQuery: string,
  showPikkuFunctions: boolean
): any[] =>
  useMemo(() => {
    const all = (rawFunctions ?? []) as any[]
    const q = searchQuery.toLowerCase()
    return all.filter((func: any) => {
      if (!showPikkuFunctions && isPikkuFunction(func)) return false
      if (!q) return true
      const funcId = func.pikkuFuncName || func.pikkuFuncId
      return (
        funcId?.toLowerCase().includes(q) ||
        func.displayName?.toLowerCase().includes(q) ||
        toEnglishName(funcId).toLowerCase().includes(q) ||
        func.summary?.toLowerCase().includes(q) ||
        func.description?.toLowerCase().includes(q)
      )
    })
  }, [rawFunctions, searchQuery, showPikkuFunctions])
