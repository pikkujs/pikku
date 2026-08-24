import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { usePikkuRPC } from '../context/PikkuRpcProvider'

export interface VirtualUserScheduleRow {
  persona: string
  enabled: boolean
  disposition: string
  goals: string[]
  minIntervalMs: number
  maxIntervalMs: number
  nextRunAt: string
  lastRunId: string | null
  lastRunAt: string | null
}

/**
 * Which personas keep using this application on their own.
 *
 * One read for every persona rather than one per row: an application has as
 * many cadences as it has personas, the rail shows all of them, and a request
 * per selection would re-ask for rows already in hand.
 *
 * An application that wired no `virtualUserScheduleStore` answers with an empty
 * list rather than an error — it has no cadences, which is a true answer.
 */
export function useVirtualUserSchedules() {
  const rpc = usePikkuRPC()

  return useQuery({
    queryKey: ['virtual-user-schedules'],
    queryFn: async () =>
      (await rpc.invoke(
        'console:getVirtualUserSchedules'
      )) as VirtualUserScheduleRow[],
  })
}

/**
 * Changes one persona's cadence.
 *
 * A partial write: every field left out keeps whatever the row already had, so
 * a toggle sends `enabled` and nothing else and cannot quietly overwrite goals
 * somebody set from the CLI between this page loading and the click.
 */
export function useSetVirtualUserSchedule(persona: string) {
  const rpc = usePikkuRPC()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: {
      enabled?: boolean
      disposition?: string
      goals?: string[]
      minIntervalMs?: number
      maxIntervalMs?: number
    }) =>
      await rpc.invoke('console:setVirtualUserSchedule', { persona, ...input }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['virtual-user-schedules'] }),
  })
}
