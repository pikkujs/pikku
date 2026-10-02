import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { usePikkuRPC } from '../context/PikkuRpcProvider'
import { filterFunctions } from '../lib/builtin-functions'

export {
  isBuiltInFunction,
  isPikkuFunction,
  isScenarioFunction,
} from '../lib/builtin-functions'

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
 * internal functions and the scenario suite are wanted.
 */
export const useFilteredFunctions = (
  rawFunctions: unknown,
  searchQuery: string,
  showPikkuFunctions: boolean
): any[] =>
  useMemo(
    () => filterFunctions(rawFunctions, searchQuery, showPikkuFunctions),
    [rawFunctions, searchQuery, showPikkuFunctions]
  )
