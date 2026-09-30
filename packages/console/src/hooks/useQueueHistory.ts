import { useQuery } from '@tanstack/react-query'
import { usePikkuRPC } from '../context/PikkuRpcProvider'

export interface QueueJobRun {
  timestamp: number
  status: 'completed' | 'failed'
  durationSeconds: number | null
  error: string | null
}

export interface QueueJobStats {
  completed: number
  failed: number
  lastRun: number | null
  recent: QueueJobRun[]
}

export interface QueueHistory {
  hours: number
  queues: Record<string, QueueJobStats>
}

/**
 * Finished jobs per queue over the host's window, or `undefined` when the host
 * keeps no job history, so callers can tell "no jobs" from "we don't know".
 */
export const useQueueHistory = (): QueueHistory | undefined => {
  const rpc = usePikkuRPC()
  const { data } = useQuery({
    queryKey: ['console:getQueueHistory'],
    queryFn: async () =>
      ((await (rpc.invoke as (name: string) => Promise<unknown>)(
        'console:getQueueHistory'
      )) ?? null) as QueueHistory | null,
    refetchInterval: 30000,
    retry: false,
  })
  return data && Object.keys(data.queues ?? {}).length > 0 ? data : undefined
}
