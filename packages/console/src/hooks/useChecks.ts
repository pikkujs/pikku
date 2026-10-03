import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { usePikkuRPC } from '../context/PikkuRpcProvider'
import type { FlattenedRPCMap } from '../pikku/rpc-map.gen.d'

export type ChecksState = FlattenedRPCMap['console:getVerifyResults']['output']
export type CheckResult = NonNullable<ChecksState['result']>
export type CheckFinding = CheckResult['findings'][number]
export type CheckStep = CheckResult['steps'][number]

const CHECKS_KEY = ['verify-results']

/** The latest check run, polled while one is in progress. */
export function useChecks() {
  const rpc = usePikkuRPC()
  return useQuery({
    queryKey: CHECKS_KEY,
    queryFn: async () =>
      (await rpc.invoke('console:getVerifyResults')) as ChecksState,
    refetchInterval: (query) => (query.state.data?.running ? 2000 : false),
  })
}

/** Starts a check run and swaps its result in when it finishes. */
export function useRunChecks() {
  const rpc = usePikkuRPC()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async () =>
      (await rpc.invoke('console:runVerify', {})) as CheckResult,
    onSuccess: (result) => {
      queryClient.setQueryData<ChecksState>(CHECKS_KEY, {
        running: false,
        result,
      })
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: CHECKS_KEY }),
  })
}
