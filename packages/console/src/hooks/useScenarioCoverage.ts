import { useQuery } from '@tanstack/react-query'
import type { ScenarioCoverage } from '@pikku/core/scenario/coverage'
import { usePikkuRPC } from '../context/PikkuRpcProvider'

export function useScenarioCoverage() {
  const rpc = usePikkuRPC()

  return useQuery<ScenarioCoverage>({
    queryKey: ['scenario-coverage'],
    queryFn: async () =>
      (await rpc.invoke('console:getScenarioCoverage', {})) as ScenarioCoverage,
  })
}
