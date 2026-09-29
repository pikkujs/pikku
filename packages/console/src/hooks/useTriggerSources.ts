import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { usePikkuRPC } from '../context/PikkuRpcProvider'

export type TriggerSourceRow = {
  name: string
  kind: string
  declared: boolean
  status: string | null
  detail: string | null
  updatedAt: string | null
}

const KEY = ['trigger-sources']

/** What each webhook source registered with its provider. Empty on an app without a trigger source store. */
export function useTriggerSources() {
  const rpc = usePikkuRPC()
  return useQuery({
    queryKey: KEY,
    queryFn: async () =>
      (
        (await rpc.invoke('admin:triggerSourceList')) as {
          sources: TriggerSourceRow[]
        }
      ).sources,
    retry: false,
  })
}

export function useForgetTriggerSource() {
  const rpc = usePikkuRPC()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (name: string) =>
      rpc.invoke('admin:triggerSourceForget', { name }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY }),
  })
}

export type RegistrationState = 'pending' | 'registered' | 'manual' | 'failed'

export const registrationState = (
  row: TriggerSourceRow | undefined
): RegistrationState => {
  if (!row?.status) return 'pending'
  if (row.status === 'failed') return 'failed'
  if (row.status === 'manual') return 'manual'
  return 'registered'
}
