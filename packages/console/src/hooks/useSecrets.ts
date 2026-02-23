import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { usePikkuRPC } from '@/context/PikkuRpcProvider'

export function useSecretValue(secretId: string | undefined, enabled: boolean) {
  const rpc = usePikkuRPC()

  return useQuery({
    queryKey: ['secret-value', secretId],
    queryFn: async () => {
      return await rpc('getSecret', { secretId: secretId! })
    },
    enabled: !!secretId && enabled,
  })
}

export function useSetSecret() {
  const rpc = usePikkuRPC()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ secretId, value }: { secretId: string; value: unknown }) =>
      rpc('setSecret', { secretId, value }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['secret-value', variables.secretId],
      })
    },
  })
}

export function useOAuthStatus(
  credentialName: string | undefined,
  enabled: boolean
) {
  const rpc = usePikkuRPC()

  return useQuery({
    queryKey: ['oauth-status', credentialName],
    queryFn: async () => {
      return await rpc('console:oauthStatus', {
        credentialName: credentialName!,
      })
    },
    enabled: !!credentialName && enabled,
  })
}

export function useOAuthConnect() {
  const rpc = usePikkuRPC()

  return useMutation({
    mutationFn: ({
      credentialName,
      callbackUrl,
    }: {
      credentialName: string
      callbackUrl?: string
    }) => rpc('console:oauthConnect', { credentialName, callbackUrl }),
  })
}

export function useOAuthDisconnect() {
  const rpc = usePikkuRPC()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ credentialName }: { credentialName: string }) =>
      rpc('console:oauthDisconnect', { credentialName }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['oauth-status', variables.credentialName],
      })
    },
  })
}

export function useOAuthExchangeTokens() {
  const rpc = usePikkuRPC()

  return useMutation({
    mutationFn: ({ code, state }: { code: string; state: string }) =>
      rpc('console:oauthExchangeTokens', { code, state }),
  })
}

export function useOAuthTestToken() {
  const rpc = usePikkuRPC()

  return useMutation({
    mutationFn: ({ credentialName }: { credentialName: string }) =>
      rpc('console:oauthTestToken', { credentialName }),
  })
}

export function useOAuthRefreshToken() {
  const rpc = usePikkuRPC()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ credentialName }: { credentialName: string }) =>
      rpc('console:oauthRefreshToken', { credentialName }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['oauth-status', variables.credentialName],
      })
    },
  })
}
