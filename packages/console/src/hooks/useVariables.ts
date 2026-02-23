import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { usePikkuRPC } from '@/context/PikkuRpcProvider'

export function useVariableValue(
  variableId: string | undefined,
  enabled: boolean
) {
  const rpc = usePikkuRPC()

  return useQuery({
    queryKey: ['variable-value', variableId],
    queryFn: async () => {
      return await rpc('getVariable', { variableId: variableId! })
    },
    enabled: !!variableId && enabled,
  })
}

export function useSetVariable() {
  const rpc = usePikkuRPC()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      variableId,
      value,
    }: {
      variableId: string
      value: unknown
    }) => rpc('setVariable', { variableId, value }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['variable-value', variables.variableId],
      })
    },
  })
}
