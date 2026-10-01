import React from 'react'
import { Alert, Button, Group } from '@pikku/mantine/core'
import { AlertTriangle, Link2 } from 'lucide-react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { asI18n } from '@pikku/react'
import { m } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'
import { usePikkuRPC } from '../../context/PikkuRpcProvider'
import { useOptionalAuth } from '../../context/AuthContext'

const useLinkCredential = (name: string) => {
  const auth = useOptionalAuth()
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await auth!.client.$fetch<{ url?: string }>(
        '/credential-oauth/link',
        {
          method: 'POST',
          body: { providerId: name, callbackURL: window.location.href },
        }
      )
      if (error) {
        throw new Error(error.message ?? m.credentials_connect_failed())
      }
      if (!data?.url) {
        throw new Error(m.credentials_connect_failed())
      }
      window.location.href = data.url
    },
  })
}

const ActionButtons: React.FC<{
  isConnected: boolean
  disabled: boolean
  connecting: boolean
  disconnecting: boolean
  onConnect: () => void
  onDisconnect: () => void
  error: unknown
}> = ({
  isConnected,
  disabled,
  connecting,
  disconnecting,
  onConnect,
  onDisconnect,
  error,
}) => (
  <Group gap="xs" wrap="nowrap">
    {isConnected ? (
      <>
        <Button
          size="xs"
          variant="default"
          disabled={disabled}
          onClick={onConnect}
          loading={connecting}
        >
          {m.credentials_reconnect()}
        </Button>
        <Button
          size="xs"
          variant="light"
          color="red"
          disabled={disabled}
          onClick={onDisconnect}
          loading={disconnecting}
        >
          {m.credentials_disconnect()}
        </Button>
      </>
    ) : (
      <Button
        size="xs"
        disabled={disabled}
        onClick={onConnect}
        loading={connecting}
        leftSection={<Link2 size={13} />}
      >
        {m.credentials_connect()}
      </Button>
    )}
    {error ? (
      <Alert
        color="red"
        variant="light"
        icon={<AlertTriangle size={14} />}
        p="xs"
      >
        {asI18n(String((error as Error)?.message || error))}
      </Alert>
    ) : null}
  </Group>
)

export const AppCredentialActions: React.FC<{
  name: string
  isConnected: boolean
}> = ({ name, isConnected }) => {
  useLocale()
  const rpc = usePikkuRPC()
  const auth = useOptionalAuth()
  const queryClient = useQueryClient()
  const connect = useLinkCredential(name)
  const disconnect = useMutation({
    mutationFn: async () => {
      await rpc.invoke('admin:credentialDelete', { name })
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ['credential-global-status'],
      })
    },
  })
  return (
    <ActionButtons
      isConnected={isConnected}
      disabled={!auth?.user}
      connecting={connect.isPending}
      disconnecting={disconnect.isPending}
      onConnect={() => connect.mutate()}
      onDisconnect={() => disconnect.mutate()}
      error={connect.error ?? disconnect.error}
    />
  )
}

export const MyCredentialActions: React.FC<{
  name: string
  isConnected: boolean
}> = ({ name, isConnected }) => {
  useLocale()
  const auth = useOptionalAuth()
  const queryClient = useQueryClient()
  const connect = useLinkCredential(name)
  const disconnect = useMutation({
    mutationFn: async () => {
      const { data: accounts } = await auth!.client.listAccounts()
      const account = (accounts ?? []).find(
        (candidate) => candidate.providerId === name
      )
      if (!account) {
        throw new Error(m.credentials_disconnect_failed())
      }
      const { error } = await auth!.client.unlinkAccount({
        accountId: account.id,
      })
      if (error) {
        throw new Error(error.message ?? m.credentials_disconnect_failed())
      }
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['linked-accounts'] }),
  })
  return (
    <ActionButtons
      isConnected={isConnected}
      disabled={!auth?.user}
      connecting={connect.isPending}
      disconnecting={disconnect.isPending}
      onConnect={() => connect.mutate()}
      onDisconnect={() => disconnect.mutate()}
      error={connect.error ?? disconnect.error}
    />
  )
}
