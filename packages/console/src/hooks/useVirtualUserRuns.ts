import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { usePikkuRPC } from '../context/PikkuRpcProvider'

/**
 * What this persona has actually been doing.
 *
 * The rest of the Virtual Users screen is built from declarations, which say
 * who the user is and what they may reach. This is the other half: whether
 * anybody ever turned them loose, and what came back when they did.
 *
 * An application that wired no `virtualUserRunStore` answers with an empty
 * list rather than an error — it has no runs, which is a true answer and not a
 * failure.
 */
export function useVirtualUserRuns(persona?: string) {
  const rpc = usePikkuRPC()

  return useQuery({
    queryKey: ['virtual-user-runs', persona],
    queryFn: async () =>
      await rpc.invoke('console:getVirtualUserRuns', {
        persona,
        limit: 20,
        offset: 0,
      }),
    enabled: !!persona,
  })
}

/**
 * One run's turns, fetched only once somebody opens it.
 *
 * Kept out of the list deliberately: a run at a 500-step budget carries more
 * transcript than every other field together, and the history is read far more
 * often than any single run is opened.
 */
export function useVirtualUserRunSteps(runId?: string) {
  const rpc = usePikkuRPC()

  return useQuery({
    queryKey: ['virtual-user-run-steps', runId],
    queryFn: async () =>
      await rpc.invoke('console:getVirtualUserRunSteps', {
        runId: runId!,
        limit: 500,
      }),
    enabled: !!runId,
  })
}

/**
 * Turns this persona loose now, rather than waiting for a schedule.
 *
 * Goes through the project's own scaffolded `runVirtualUser`, so the console
 * cannot start a run the application would have refused — an acted-upon persona
 * has no session, and only one disposition may touch production.
 *
 * The run is dispatched, not awaited: it takes minutes, and the record it
 * writes is what the list is reading. Refetching once on success is enough to
 * show it as `running`.
 */
export function useStartVirtualUserRun(persona?: string) {
  const rpc = usePikkuRPC()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input?: { disposition?: string; goals?: string[] }) =>
      await rpc.invoke('console:startVirtualUserRun', {
        persona: persona!,
        ...input,
      }),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: ['virtual-user-runs', persona],
      }),
  })
}
