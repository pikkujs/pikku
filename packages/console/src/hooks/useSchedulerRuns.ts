import { useQuery } from '@tanstack/react-query'
import { usePikkuRPC } from '../context/PikkuRpcProvider'

export interface SchedulerRun {
  timestamp: number
  status: 'completed' | 'failed'
  durationSeconds: number | null
  error: string | null
}

export type SchedulerRuns = Record<
  string,
  { lastRun: SchedulerRun | null; history: SchedulerRun[] }
>

/**
 * The last week of runs per scheduled task, or `undefined` when the host keeps
 * no run history, so callers can tell "never ran" from "we don't know".
 */
export const useSchedulerRuns = (): SchedulerRuns | undefined => {
  const rpc = usePikkuRPC()
  const { data } = useQuery({
    queryKey: ['console:getSchedulerHistory'],
    queryFn: async () =>
      ((await (rpc.invoke as (name: string) => Promise<unknown>)(
        'console:getSchedulerHistory'
      )) ?? {}) as SchedulerRuns,
    refetchInterval: 30000,
    retry: false,
  })
  return data && Object.values(data).some((t) => t.lastRun) ? data : undefined
}
