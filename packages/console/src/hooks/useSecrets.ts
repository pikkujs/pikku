import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { usePikkuRPC } from '../context/PikkuRpcProvider'

export function useSecretValue(secretId: string | undefined, enabled: boolean) {
  const rpc = usePikkuRPC()

  return useQuery({
    queryKey: ['secret-value', secretId],
    queryFn: async () => {
      return await rpc.invoke('pikkuConsoleGetSecret', { secretId: secretId! })
    },
    enabled: !!secretId && enabled,
  })
}

export function useSetSecret() {
  const rpc = usePikkuRPC()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ secretId, value }: { secretId: string; value: unknown }) =>
      rpc.invoke('pikkuConsoleSetSecret', { secretId, value }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['secret-value', variables.secretId],
      })
    },
  })
}
